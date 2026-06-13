import { render, screen } from '@testing-library/react'
import IntegrationOverviewView from '../IntegrationOverviewView'
import type { IntegrationOverviewData } from '@/lib/integrations/overview'

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
  it('renders source filters and privacy note', () => {
    render(<IntegrationOverviewView data={makeData()} />)

    expect(screen.getByText('Gmail Overview')).toBeInTheDocument()
    expect(screen.getByText('Gmail memory is personal. Your emails are not shared with your team.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Integrations' })).toHaveAttribute('href', '/dashboard/integrations')
    expect(screen.getByRole('link', { name: 'Decisions 0' })).toHaveAttribute('href', '/dashboard/integrations/gmail?filter=decisions')
    expect(screen.getByText('Launch update')).toBeInTheDocument()
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
    expect(screen.getByRole('link', { name: /Product Plan/ })).toHaveAttribute('href', '/dashboard/notion/page-1')
    expect(screen.getByRole('link', { name: /Launch Notes/ })).toHaveAttribute('href', '/dashboard/notion/page-2')
  })
})
