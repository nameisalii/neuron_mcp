import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DatatruckIntegrationCard from '../DatatruckIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

describe('DatatruckIntegrationCard — not connected', () => {
  it('shows Connect Datatruck and hides sync controls', () => {
    render(<DatatruckIntegrationCard status="not_connected" companyName={null} lastSyncAt={null} />)

    expect(screen.getByRole('button', { name: 'Connect Datatruck' })).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument()
  })

  it('shows Ready to connect when env fallback credentials exist without a connector', () => {
    render(<DatatruckIntegrationCard status="ready" companyName={null} lastSyncAt={null} envCompanyName="sflogistics" />)

    expect(screen.getByText('Ready to connect')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Datatruck' })).toBeInTheDocument()
  })

  it('opens the setup modal with company name and API token fields', () => {
    render(<DatatruckIntegrationCard status="not_connected" companyName={null} lastSyncAt={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect Datatruck' }))

    expect(screen.getByText('Connect Datatruck', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('sflogistics')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste your Datatruck API token')).toHaveAttribute('type', 'password')
  })

  it('prefills the company name from the env fallback but never a token', () => {
    render(<DatatruckIntegrationCard status="ready" companyName={null} lastSyncAt={null} envCompanyName="sflogistics" />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect Datatruck' }))

    expect(screen.getByPlaceholderText('sflogistics')).toHaveValue('sflogistics')
    expect(screen.getByPlaceholderText('Paste your Datatruck API token')).toHaveValue('')
  })

  it('disables submit until both company name and API token are provided', () => {
    render(<DatatruckIntegrationCard status="not_connected" companyName={null} lastSyncAt={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect Datatruck' }))
    const submit = screen.getAllByRole('button', { name: 'Connect Datatruck' }).at(-1) as HTMLElement

    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('sflogistics'), { target: { value: 'sflogistics' } })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Paste your Datatruck API token'), { target: { value: 'tok-123' } })
    expect(submit).not.toBeDisabled()
  })

  it('normalizes a full Datatruck URL and posts to the configure route', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Datatruck connected.', connector: { id: 'c1', status: 'connected', companyName: 'sflogistics' } }),
    }) as never

    render(<DatatruckIntegrationCard status="not_connected" companyName={null} lastSyncAt={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect Datatruck' }))
    fireEvent.change(screen.getByPlaceholderText('sflogistics'), { target: { value: 'https://SFLogistics.datatruck.io' } })
    fireEvent.change(screen.getByPlaceholderText('Paste your Datatruck API token'), { target: { value: 'tok-secret' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect Datatruck' }).at(-1) as HTMLElement)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/integrations/datatruck/configure', expect.objectContaining({ method: 'POST' }))
    })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ companyName: 'sflogistics', apiToken: 'tok-secret' })
  })

  it('never displays the token after a successful save', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Datatruck connected.', connector: { id: 'c1', status: 'connected', companyName: 'sflogistics' } }),
    }) as never

    render(<DatatruckIntegrationCard status="not_connected" companyName={null} lastSyncAt={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect Datatruck' }))
    fireEvent.change(screen.getByPlaceholderText('sflogistics'), { target: { value: 'sflogistics' } })
    fireEvent.change(screen.getByPlaceholderText('Paste your Datatruck API token'), { target: { value: 'tok-secret' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect Datatruck' }).at(-1) as HTMLElement)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
    expect(document.body.textContent).not.toContain('tok-secret')
    const tokenInputs = document.querySelectorAll('input[type="password"]')
    tokenInputs.forEach((input) => expect((input as HTMLInputElement).value).toBe(''))
  })
})

describe('DatatruckIntegrationCard — connected', () => {
  it('shows the company name, last sync, and the Sync Now / View / Disconnect actions', () => {
    render(
      <DatatruckIntegrationCard
        status="connected"
        companyName="sflogistics"
        lastSyncAt="2026-07-01T00:00:00.000Z"
      />,
    )

    expect(screen.getByText('Connected', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('sflogistics')).toBeInTheDocument()
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/datatruck')
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Datatruck' })).not.toBeInTheDocument()
  })

  it('shows Never when the integration has not synced yet', () => {
    render(<DatatruckIntegrationCard status="connected" companyName="sflogistics" lastSyncAt={null} />)

    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('shows a concise sync error message without raw debug text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ success: false, error: 'Datatruck sync failed. Check API token or permissions.', debug: 'HTTP 401 at /orders/' }),
    }) as never

    render(<DatatruckIntegrationCard status="sync_error" companyName="sflogistics" lastSyncAt={null} />)

    expect(screen.getByText('Sync error')).toBeInTheDocument()
    expect(screen.getByText('Datatruck sync failed. Check API token or permissions.')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Sync Now'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/integrations/datatruck/sync', { method: 'POST' })
    })
    expect(document.body.textContent).not.toContain('HTTP 401')
  })
})
