import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AddKnowledgeModal from '../AddKnowledgeModal'
import IntegrationOverviewView from '../IntegrationOverviewView'
import type { IntegrationOverviewData } from '@/lib/integrations/overview'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

function renderModal(source = 'slack', sourceLabel = 'Slack') {
  const onSaved = jest.fn()
  const onClose = jest.fn()
  render(
    <AddKnowledgeModal source={source} sourceLabel={sourceLabel} isOpen onClose={onClose} onSaved={onSaved} />,
  )
  return { onSaved, onClose }
}

describe('AddKnowledgeModal', () => {
  it('renders title, description, category, and file fields', () => {
    renderModal()

    expect(screen.getByText('Add knowledge to Slack')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Customer requires signed BOL/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/rule, note, process, decision/)).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByLabelText('Attach file')).toBeInTheDocument()
    expect(screen.queryByText(/Load ID/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Document type/)).not.toBeInTheDocument()
  })

  it('shows Datatruck-only load and document type fields', () => {
    renderModal('datatruck', 'Datatruck')

    expect(screen.getByText(/Load ID/)).toBeInTheDocument()
    expect(screen.getByText(/Document type/)).toBeInTheDocument()
  })

  it('validates missing title and description', async () => {
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Save knowledge' }))
    expect(await screen.findByText('Title is required.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/Customer requires signed BOL/), { target: { value: 'A rule' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save knowledge' }))
    expect(await screen.findByText('Description is required.')).toBeInTheDocument()
    expect(global.fetch).toBe(originalFetch)
  })

  it('saves via the API and closes on success', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    global.fetch = fetchMock as never
    const { onSaved, onClose } = renderModal('datatruck', 'Datatruck')

    fireEvent.change(screen.getByPlaceholderText(/Customer requires signed BOL/), { target: { value: 'BOL rule' } })
    fireEvent.change(screen.getByPlaceholderText(/rule, note, process, decision/), { target: { value: 'Always collect signed BOL.' } })
    fireEvent.change(screen.getByPlaceholderText('12345'), { target: { value: '8821' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save knowledge' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/integrations/datatruck/knowledge')
    const form = init.body as FormData
    expect(form.get('title')).toBe('BOL rule')
    expect(form.get('description')).toBe('Always collect signed BOL.')
    expect(form.get('externalLoadId')).toBe('8821')
    expect(onClose).toHaveBeenCalled()
  })

  it('rejects unsupported files with a friendly message', () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Attach file'), {
      target: { files: [new File(['x'], 'virus.exe', { type: 'application/octet-stream' })] },
    })

    expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument()
  })
})

describe('IntegrationOverviewView — Add knowledge', () => {
  function makeData(overrides: Partial<IntegrationOverviewData> = {}): IntegrationOverviewData {
    const categoryCounts = {
      decision: 0, rule: 0, process: 0, idea: 0, fact: 1,
      status_update: 0, plan: 0, follow_up: 0, reference: 0, note: 0,
    }
    return {
      source: 'slack',
      title: 'Slack Overview',
      subtitle: 'Knowledge extracted from your Slack workspace.',
      connected: true,
      filter: 'all',
      lastSyncAt: '2026-07-01T00:00:00.000Z',
      summaryCards: [],
      details: [],
      totalCount: 1,
      categoryCounts,
      filters: [],
      items: [
        {
          id: 'ki-manual-1',
          content: 'BOL rule\n\nAlways collect a signed BOL.',
          category: 'rule',
          source: 'slack',
          sourceUrl: null,
          sourceMetadata: {
            manual: true,
            title: 'BOL rule',
            createdByName: 'Ali',
            documentId: 'doc-7',
          },
        },
      ] as unknown as IntegrationOverviewData['items'],
      emptyState: { title: 'x', description: 'y', actionLabel: 'z', actionHref: '/dashboard/integrations' },
      ...overrides,
    }
  }

  it('shows the Add knowledge button and opens the modal', () => {
    render(<IntegrationOverviewView data={makeData()} />)

    fireEvent.click(screen.getByRole('button', { name: /Add knowledge/ }))

    expect(screen.getByText('Add knowledge to Slack')).toBeInTheDocument()
  })

  it('shows a Manual badge, creator, and Open document link for manual items', () => {
    render(<IntegrationOverviewView data={makeData()} />)

    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(screen.getByText('Added by Ali')).toBeInTheDocument()
    const openLink = screen.getByRole('link', { name: /Open document/ })
    expect(openLink).toHaveAttribute('href', '/api/documents/doc-7')
  })
})
