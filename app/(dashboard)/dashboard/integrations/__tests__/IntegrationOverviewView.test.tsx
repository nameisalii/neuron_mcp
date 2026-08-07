import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import IntegrationOverviewView from '../IntegrationOverviewView'
import type { IntegrationOverviewData } from '@/lib/integrations/overview'

const mockRefresh = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

function makeData(overrides: Partial<IntegrationOverviewData> = {}): IntegrationOverviewData {
  return {
    source: 'gmail',
    title: 'Gmail Overview',
    subtitle: 'Private memory extracted from your selected Gmail labels.',
    privacyNote: 'Gmail memory is personal. Your emails are not shared with your team.',
    connected: true,
    filter: 'all',
    lastSyncAt: '2026-06-12T00:00:00.000Z',
    summaryCards: [
      { label: 'Knowledge items', value: '1' },
      { label: 'Threads', value: '1' },
      { label: 'Chunks', value: '1' },
      { label: 'Selected labels', value: 'INBOX, SENT' },
      { label: 'Privacy', value: 'Personal' },
      { label: 'Last sync', value: 'Jun 12, 2026' },
    ],
    details: [
      { label: 'Selected labels', value: 'Inbox · Sent' },
      { label: 'Privacy', value: 'Personal' },
    ],
    totalCount: 1,
    categoryCounts: {
      decision: 1,
      rule: 0,
      process: 0,
      idea: 0,
      fact: 0,
      status_update: 0,
      plan: 0,
      follow_up: 0,
      reference: 0,
      note: 0,
    },
    filters: [
      { key: 'all', label: 'All', count: 1 },
      { key: 'decisions', label: 'Decisions', count: 0 },
      { key: 'rules', label: 'Rules', count: 0 },
      { key: 'processes', label: 'Processes', count: 0 },
      { key: 'ideas', label: 'Ideas', count: 0 },
      { key: 'facts', label: 'Facts', count: 0 },
      { key: 'status_updates', label: 'Status Updates', count: 0 },
      { key: 'plans', label: 'Plans', count: 0 },
      { key: 'follow_ups', label: 'Follow-ups', count: 0 },
    ],
    items: [
      {
        id: 'ki-1',
        content: 'Email from Team about launch: We decided to delay launch until the Gmail sync is stable.',
        category: 'decision',
        source: 'gmail',
        sourceUrl: 'https://mail.google.com/mail/u/0/#inbox/FM',
        sourceExternalId: 'thread-1',
        owner: 'team@example.com',
        sourceCreatedAt: '2026-06-12T00:00:00.000Z',
        updatedAt: '2026-06-12T01:00:00.000Z',
        title: 'Launch update',
        sourceLabels: ['decision'],
      },
    ],
    emptyState: {
      title: 'Gmail is connected, but no emails have been synced yet.',
      description: 'Open Gmail settings to sync now or adjust labels.',
      actionLabel: 'Sync Gmail now',
      actionHref: '/dashboard/integrations',
    },
    ...overrides,
  }
}

describe('IntegrationOverviewView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('renders source filters and privacy note', () => {
    render(<IntegrationOverviewView data={makeData()} />)

    expect(screen.getByText('Gmail Overview')).toBeInTheDocument()
    expect(screen.getByText('Gmail memory is personal. Your emails are not shared with your team.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Integrations' })).toHaveAttribute('href', '/dashboard/integrations')
    expect(screen.getByRole('link', { name: 'Decisions 1' })).toHaveAttribute('href', '/dashboard/integrations/gmail?filter=decisions')
    expect(screen.getByText('Launch update')).toBeInTheDocument()
  })

  it('searches synced Gmail memory across titles, content, owners, and labels', () => {
    render(<IntegrationOverviewView data={makeData({
      totalCount: 2,
      items: [
        ...makeData().items,
        {
          ...makeData().items[0],
          id: 'ki-2',
          title: 'HRT interview update',
          content: 'Hudson River Trading recruiter shared next steps.',
          owner: 'recruiter@example.com',
          sourceExternalId: 'thread-2',
        },
      ],
    })} />)

    const search = screen.getByRole('searchbox', { name: 'Search synced Gmail memory' })
    expect(search).toHaveAttribute('placeholder', 'Search people, companies, subjects, interviews, or keywords')

    fireEvent.change(search, { target: { value: 'Hudson River Trading' } })
    expect(screen.getByText('HRT interview update')).toBeInTheDocument()
    expect(screen.queryByText('Launch update')).not.toBeInTheDocument()
    expect(screen.getByText('1 matching item')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'missing company' } })
    expect(screen.getByText('No matching Gmail memory')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByText('Launch update')).toBeInTheDocument()
  })

  it('does not show the Gmail search bar on other integration overviews', () => {
    render(<IntegrationOverviewView data={makeData({ source: 'slack', title: 'Slack Overview' })} />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('shows the searchable memory section on Telegram overview', () => {
    render(<IntegrationOverviewView data={makeData({
      source: 'telegram',
      title: 'Telegram Overview',
      subtitle: 'Knowledge extracted from Telegram messages.',
      items: [{
        ...makeData().items[0],
        id: 'telegram-1',
        source: 'telegram',
        title: 'HRT recruiting chat',
        content: 'Recruiter shared the interview next steps in Telegram.',
        owner: 'Recruiting channel',
      }],
    })} />)

    const search = screen.getByRole('searchbox', { name: 'Search synced Telegram memory' })
    expect(search).toHaveAttribute('placeholder', 'Search chats, people, channels, companies, or keywords')
    fireEvent.change(search, { target: { value: 'HRT' } })
    expect(screen.getByText('HRT recruiting chat')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'missing' } })
    expect(screen.getByText('No matching Telegram memory')).toBeInTheDocument()
  })

  it('renders a clean empty state when no items are synced', () => {
    render(<IntegrationOverviewView data={makeData({ items: [] })} />)

    expect(screen.getByText('Gmail is connected, but no emails have been synced yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sync Gmail now' })).toHaveAttribute('href', '/dashboard/integrations')
    expect(screen.getByRole('link', { name: 'Change Gmail filters' })).toHaveAttribute('href', '/dashboard/integrations?connected=gmail')
  })

  it('renders every Notion project in the integration view', () => {
    render(<IntegrationOverviewView data={makeData({
      source: 'notion',
      title: 'Notion Overview',
      notionProjects: [
        { id: 'page-1', title: 'Product Plan', syncedAt: '2026-06-12T00:00:00.000Z', chunkCount: 4, knowledgeCount: 2 },
        { id: 'page-2', title: 'Launch Notes', syncedAt: '2026-06-11T00:00:00.000Z', chunkCount: 3, knowledgeCount: 1 },
      ],
    })} />)

    expect(screen.getByText('All Notion projects')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Product Plan/ })).toHaveAttribute('href', '/dashboard/knowledge')
    expect(screen.getByRole('link', { name: /Launch Notes/ })).toHaveAttribute('href', '/dashboard/knowledge')
  })

  it('renders a Datatruck connect button that opens the setup flow when not connected', () => {
    render(<IntegrationOverviewView data={makeData({
      source: 'datatruck',
      title: 'Datatruck Overview',
      subtitle: 'Knowledge extracted from Datatruck loads, documents, carriers, and dispatch context.',
      connected: false,
      items: [],
      emptyState: {
        title: 'Datatruck is not connected yet.',
        description: 'Connect Datatruck to start extracting knowledge from this source.',
        actionLabel: 'Back to Integrations',
        actionHref: '/dashboard/integrations',
      },
    })} />)

    expect(screen.getByRole('button', { name: 'Connect Datatruck' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Connect Datatruck' }))

    expect(screen.getByRole('heading', { name: 'Connect Datatruck' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Example: sflogistics')).toBeInTheDocument()
    expect(screen.getByLabelText('Datatruck company name')).toHaveValue('')
  })

  it('renders Datatruck endpoint coverage with official and unavailable modules', () => {
    render(<IntegrationOverviewView data={makeData({
      source: 'datatruck',
      title: 'Datatruck Overview',
      connected: true,
      datatruckCoverage: [
        { key: 'loads', label: 'Loads', path: '/orders/', status: 'synced', fetched: 4, created: 2, updated: 1, skipped: 1, lastError: null, configuredBy: 'default', coverageStatus: 'official_api', sourceLabel: 'Official API', fileImported: 0 },
        { key: 'invoices', label: 'Invoices', path: null, status: 'not_mapped', fetched: null, created: null, updated: null, skipped: null, lastError: null, configuredBy: 'not_mapped', coverageStatus: 'not_connected', sourceLabel: 'No source connected', fileImported: 0 },
      ],
      datatruckWarnings: ['Invoices is not available via the current Datatruck API configuration'],
    })} />)

    expect(screen.getByText('Datatruck coverage')).toBeInTheDocument()
    expect(screen.getByText('1 official modules connected')).toBeInTheDocument()
    expect(screen.getByText('Core Datatruck data')).toBeInTheDocument()
    expect(screen.getByText('Additional modules')).toBeInTheDocument()
    expect(screen.getByText('4 records')).toBeInTheDocument()
    expect(screen.getByText('No source connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect source' })).toBeInTheDocument()
    expect(screen.queryByText('Not available via current API')).not.toBeInTheDocument()
    expect(screen.queryByText(/0 created, 0 updated, 0 skipped/)).not.toBeInTheDocument()
  })

  it('keeps advanced endpoint mapping collapsed until requested', () => {
    render(<IntegrationOverviewView data={makeData({
      source: 'datatruck',
      title: 'Datatruck Overview',
      connected: true,
      datatruckCoverage: [
        { key: 'loads', label: 'Loads', path: '/orders/', status: 'synced', fetched: 4, created: 2, updated: 1, skipped: 1, lastError: null, configuredBy: 'default', coverageStatus: 'official_api', sourceLabel: 'Official API', fileImported: 0 },
        { key: 'invoices', label: 'Invoices', path: null, status: 'not_mapped', fetched: null, created: null, updated: null, skipped: null, lastError: null, configuredBy: 'not_mapped', coverageStatus: 'not_connected', sourceLabel: 'No source connected', fileImported: 0 },
      ],
    })} />)

    expect(screen.getByText('Advanced endpoint mapping')).toBeInTheDocument()
    expect(screen.getByText('Company name and API token are enough for the default Datatruck sync. Use advanced mapping only to add confirmed paths for extra modules.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Invoices')).not.toBeInTheDocument()
    expect(screen.queryByText('/example/list/')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced mapping' }))

    expect(screen.getByLabelText('Invoices')).toBeInTheDocument()
    expect(screen.getByText('Core endpoints')).toBeInTheDocument()
    expect(screen.getByText('Optional modules')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit core endpoints' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste confirmed endpoint path after /api/v1/openapi')).toBeInTheDocument()
    expect(screen.queryByText('/example/list/')).not.toBeInTheDocument()
  })

  it('renders the endpoint discovery tutorial inside advanced mapping', () => {
    render(<IntegrationOverviewView data={makeData({
      source: 'datatruck',
      title: 'Datatruck Overview',
      connected: true,
      datatruckCoverage: [
        { key: 'invoices', label: 'Invoices', path: null, status: 'not_mapped', fetched: null, created: null, updated: null, skipped: null, lastError: null, configuredBy: 'not_mapped', coverageStatus: 'not_connected', sourceLabel: 'No source connected', fileImported: 0 },
      ],
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced mapping' }))
    fireEvent.click(screen.getByRole('button', { name: /How to find Datatruck endpoint paths/ }))

    expect(screen.getByText('Open Chrome DevTools.')).toBeInTheDocument()
    expect(screen.getByText('Copy the path after /api/v1/openapi.')).toBeInTheDocument()
    expect(screen.getByText('Endpoint path: /confirmed/path/')).toBeInTheDocument()
    expect(screen.getByText('Never paste your API token into endpoint fields.')).toBeInTheDocument()
  })

  it('saves trimmed normalized Datatruck endpoint mapping without empty optional endpoints or tokens', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    global.fetch = fetchMock as never

    render(<IntegrationOverviewView data={makeData({
      source: 'datatruck',
      title: 'Datatruck Overview',
      connected: true,
      datatruckCoverage: [
        { key: 'loads', label: 'Loads', path: '/orders/', status: 'synced', fetched: 4, created: 2, updated: 1, skipped: 1, lastError: null, configuredBy: 'default', coverageStatus: 'official_api', sourceLabel: 'Official API', fileImported: 0 },
        { key: 'invoices', label: 'Invoices', path: null, status: 'not_mapped', fetched: null, created: null, updated: null, skipped: null, lastError: null, configuredBy: 'not_mapped', coverageStatus: 'not_connected', sourceLabel: 'No source connected', fileImported: 0 },
        { key: 'fuel', label: 'Fuel', path: null, status: 'not_mapped', fetched: null, created: null, updated: null, skipped: null, lastError: null, configuredBy: 'not_mapped', coverageStatus: 'not_connected', sourceLabel: 'No source connected', fileImported: 0 },
      ],
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced mapping' }))
    expect(screen.getByRole('button', { name: 'Save mapping' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Invoices'), { target: { value: ' confirmed/path/ ' } })
    fireEvent.change(screen.getByLabelText('Fuel'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/integrations/datatruck/configure', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ endpointMapping: { invoices: '/confirmed/path/' } }),
    })))
    await screen.findByText('Endpoint mapping saved.')
    expect(JSON.stringify(document.body.textContent)).not.toContain('token')
  })

  it('shows Test only when an endpoint value exists and renders safe test results', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        httpStatus: 200,
        shape: 'results',
        recordCount: 1,
        fieldNames: ['id', 'status'],
        pagination: { detected: true },
      }),
    })
    global.fetch = fetchMock as never

    render(<IntegrationOverviewView data={makeData({
      source: 'datatruck',
      title: 'Datatruck Overview',
      connected: true,
      datatruckCoverage: [
        { key: 'invoices', label: 'Invoices', path: null, status: 'not_mapped', fetched: null, created: null, updated: null, skipped: null, lastError: null, configuredBy: 'not_mapped', coverageStatus: 'not_connected', sourceLabel: 'No source connected', fileImported: 0 },
      ],
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced mapping' }))
    expect(screen.queryByRole('button', { name: 'Test' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Invoices'), { target: { value: '/confirmed/path/' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/integrations/datatruck/test-endpoint', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ path: '/confirmed/path/' }),
    })))
    expect(await screen.findByText('Success. HTTP 200. 1 result (results shape).')).toBeInTheDocument()
    expect(screen.getByText('Fields: id, status Pagination detected.')).toBeInTheDocument()
    expect(JSON.stringify(document.body.textContent)).not.toContain('secret-token')
  })
})
