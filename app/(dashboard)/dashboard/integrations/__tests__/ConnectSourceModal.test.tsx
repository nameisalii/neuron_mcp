import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ConnectSourceModal from '../ConnectSourceModal'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

function renderModal() {
  const onSaved = jest.fn()
  const onClose = jest.fn()
  render(
    <ConnectSourceModal
      moduleKey="invoices"
      moduleLabel="Invoices"
      currentMapping={{ fuel: '/fuel/list/' }}
      isOpen
      onClose={onClose}
      onSaved={onSaved}
    />,
  )
  return { onSaved, onClose }
}

it('renders both connection methods and an inactive webhook note', () => {
  renderModal()

  expect(screen.getByText('Connect Invoices')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'API endpoint' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'File import' })).toBeInTheDocument()
  expect(screen.getByText('Webhook ingestion is not available from Datatruck yet.')).toBeInTheDocument()
})

it('keeps Save disabled until an endpoint test succeeds, then saves the merged mapping', async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, httpStatus: 200, shape: 'results', recordCount: 3, fieldNames: ['id'], pagination: { detected: true } }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
  global.fetch = fetchMock as never
  const { onSaved } = renderModal()

  const saveButton = screen.getByRole('button', { name: 'Save source' })
  expect(saveButton).toBeDisabled()

  fireEvent.change(screen.getByLabelText('Endpoint or full Datatruck URL'), { target: { value: '/invoices/list/' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test' }))

  await screen.findByText('Test succeeded (HTTP 200)')
  expect(screen.getByText(/Shape: results · 3 records · pagination detected/)).toBeInTheDocument()
  expect(saveButton).toBeEnabled()

  fireEvent.click(saveButton)
  await waitFor(() => expect(onSaved).toHaveBeenCalled())

  const [testUrl] = fetchMock.mock.calls[0]
  expect(testUrl).toBe('/api/integrations/datatruck/test-endpoint')
  const [saveUrl, saveInit] = fetchMock.mock.calls[1]
  expect(saveUrl).toBe('/api/integrations/datatruck/configure')
  expect(JSON.parse(saveInit.body)).toEqual({
    endpointMapping: { fuel: '/fuel/list/', invoices: '/invoices/list/' },
  })
})

it('shows a friendly error when the test fails and keeps Save disabled', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ success: false, error: 'This endpoint was not found in Datatruck. Double-check the path from DevTools.' }),
  }) as never
  renderModal()

  fireEvent.change(screen.getByLabelText('Endpoint or full Datatruck URL'), { target: { value: '/bad/' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test' }))

  expect(await screen.findByText(/not found in Datatruck/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save source' })).toBeDisabled()
})

it('imports a file with the module assignment', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
  global.fetch = fetchMock as never
  const { onSaved } = renderModal()

  fireEvent.click(screen.getByRole('button', { name: 'File import' }))
  fireEvent.change(screen.getByLabelText('Import file'), {
    target: { files: [new File(['invoice,total\nINV-1,100'], 'invoices.csv', { type: 'text/csv' })] },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Import file' }))

  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/integrations/datatruck/knowledge')
  const form = init.body as FormData
  expect(form.get('moduleKey')).toBe('invoices')
  expect(form.get('category')).toBe('reference')
  expect((form.get('file') as File).name).toBe('invoices.csv')
})

it('shows the DevTools tutorial with the frontend URL warning', () => {
  renderModal()

  fireEvent.click(screen.getByText('How to find the data request used by Datatruck'))

  expect(screen.getByText('Open Chrome DevTools.')).toBeInTheDocument()
  expect(screen.getByText(/frontend page URLs/)).toBeInTheDocument()
})
