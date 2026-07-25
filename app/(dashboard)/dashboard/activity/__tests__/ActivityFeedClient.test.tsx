import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ActivityFeedClient from '../ActivityFeedClient'
import type { BrainActivityAnalytics } from '@/lib/activity/analytics'

jest.mock('framer-motion', () => {
  const actual = jest.requireActual('framer-motion')
  return { ...actual, useReducedMotion: jest.fn(() => false) }
})

jest.mock('@/components/SourceIcon', () => {
  return function MockSourceIcon({ source }: { source: string }) {
    return <span>{source}</span>
  }
})

const baseAnalytics: BrainActivityAnalytics = {
  totals: {
    knowledgeItems: 27,
    questionsAsked: 18,
    documents: 9,
    activeSources: 4,
    activeUsers: 3,
    syncs: 6,
  },
  activityByDay: [
    { date: '2026-07-02', label: 'Thu', count: 1 },
    { date: '2026-07-03', label: 'Fri', count: 4 },
    { date: '2026-07-04', label: 'Sat', count: 2 },
    { date: '2026-07-05', label: 'Sun', count: 0 },
    { date: '2026-07-06', label: 'Mon', count: 3 },
    { date: '2026-07-07', label: 'Tue', count: 2 },
    { date: '2026-07-08', label: 'Wed', count: 5 },
  ],
  sources: [
    { source: 'datatruck', label: 'Datatruck', count: 11 },
    { source: 'gmail', label: 'Gmail', count: 7 },
    { source: 'telegram', label: 'Telegram', count: 4 },
  ],
  frequentQuestions: [
    {
      key: 'find bol for load 12345',
      label: 'Find BOL for load 12345',
      preview: 'Find BOL for load 12345',
      count: 3,
      lastAskedAt: '2026-07-08T10:00:00.000Z',
      conversationId: 'conv-loads',
    },
  ],
  integrationHealth: [
    {
      source: 'datatruck',
      label: 'Datatruck',
      status: 'sync_warning',
      statusLabel: 'Sync warning',
      lastSyncAt: '2026-07-08T09:15:00.000Z',
      itemCount: 11,
      documentCount: 3,
      href: '/dashboard/integrations/datatruck',
    },
  ],
  recentKnowledge: [
    {
      id: 'ki-1',
      title: 'Datatruck load 12345 status updated to delivered',
      preview: 'Datatruck load 12345 status updated to delivered with POD attached.',
      source: 'datatruck',
      sourceLabel: 'Datatruck',
      category: 'fact',
      verified: true,
      updatedAt: '2026-07-08T11:15:00.000Z',
      href: '/dashboard/integrations/datatruck',
    },
  ],
  activeUsers: [
    {
      userId: 'u-1',
      displayName: 'Ali Nazarov',
      count: 6,
      lastActiveAt: '2026-07-08T10:00:00.000Z',
    },
  ],
  needsAttention: [
    {
      label: '1 integration has sync warnings',
      description: 'One or more connectors reported sync warnings or errors.',
      tone: 'danger',
    },
  ],
  feed: {
    total: 7,
    page: 1,
    limit: 30,
    events: [
      {
        id: 'evt-1',
        userId: 'u-1',
        displayName: 'Ali Nazarov',
        eventType: 'query',
        description: 'Asked: find BOL for load 12345',
        metadata: {
          conversationId: 'conv-1',
          documentId: 'doc-1',
          sourceUrl: 'https://example.com/source',
          integration: 'datatruck',
        },
        createdAt: '2026-07-08T10:00:00.000Z',
      },
      {
        id: 'evt-2',
        userId: 'u-2',
        displayName: 'Mina Ali',
        eventType: 'sync',
        description: 'Synced Gmail',
        metadata: null,
        createdAt: '2026-07-08T09:50:00.000Z',
      },
      {
        id: 'evt-3',
        userId: 'u-1',
        displayName: 'Ali Nazarov',
        eventType: 'label',
        description: 'Updated labels on a knowledge item',
        metadata: null,
        createdAt: '2026-07-08T09:40:00.000Z',
      },
      {
        id: 'evt-4',
        userId: 'u-2',
        displayName: 'Mina Ali',
        eventType: 'query',
        description: 'Asked: what changed in Telegram today?',
        metadata: { conversationId: 'conv-2' },
        createdAt: '2026-07-08T09:30:00.000Z',
      },
      {
        id: 'evt-5',
        userId: 'u-1',
        displayName: 'Ali Nazarov',
        eventType: 'sync',
        description: 'Synced Datatruck',
        metadata: null,
        createdAt: '2026-07-08T09:20:00.000Z',
      },
      {
        id: 'evt-6',
        userId: 'u-2',
        displayName: 'Mina Ali',
        eventType: 'invite',
        description: 'Invited a teammate',
        metadata: null,
        createdAt: '2026-07-08T09:10:00.000Z',
      },
      {
        id: 'evt-7',
        userId: 'u-1',
        displayName: 'Ali Nazarov',
        eventType: 'conflict_detected',
        description: 'Conflict detected in a knowledge item',
        metadata: null,
        createdAt: '2026-07-08T09:00:00.000Z',
      },
    ],
  },
}

function renderActivity(overrides: Partial<BrainActivityAnalytics> = {}) {
  return render(
    <ActivityFeedClient
      workspaceId="workspace-1"
      workspaceType="team"
      currentUserId="u-1"
      members={[
        { userId: 'u-1', displayName: 'Ali Nazarov', avatarUrl: null },
        { userId: 'u-2', displayName: 'Mina Ali', avatarUrl: null },
      ]}
      analytics={{ ...baseAnalytics, ...overrides }}
    />,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: [
        {
          id: 'evt-2',
          userId: 'u-2',
          displayName: 'Mina Ali',
          eventType: 'sync',
          description: 'Synced Gmail',
          metadata: null,
          createdAt: '2026-07-08T11:00:00.000Z',
        },
      ],
      meta: { total: 1, page: 1, limit: 30 },
    }),
  } as Response)
})

it('renders the analytics dashboard and recent feed', () => {
  renderActivity()

  expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument()
  expect(screen.getByText('Recent updates from your workspace.')).toBeInTheDocument()
  expect(screen.queryByText('Workspace brain health, usage, and recent changes.')).not.toBeInTheDocument()
  expect(screen.getByText('Knowledge items')).toBeInTheDocument()
  expect(screen.getByText('27')).toBeInTheDocument()
  expect(screen.getByText('Brain activity')).toBeInTheDocument()
  expect(screen.getByText('Most used integrations')).toBeInTheDocument()
  expect(screen.getByText('Frequent questions')).toBeInTheDocument()
  expect(screen.getByText('Recent activity')).toBeInTheDocument()
  expect(screen.getByText('Recent knowledge')).toBeInTheDocument()
  expect(screen.getByText('Integration health')).toBeInTheDocument()
  expect(screen.getAllByText('Active users')[0]).toBeInTheDocument()
  expect(screen.getAllByText('Needs attention')[0]).toBeInTheDocument()
  expect(screen.getAllByText('Find BOL for load 12345').length).toBeGreaterThan(1)
  expect(screen.getByText('Datatruck load 12345 status updated to delivered')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
  expect(screen.queryByText('Conflict detected in a knowledge item')).not.toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Open conversation' }).some((link) => link.getAttribute('href') === '/dashboard/query?conversationId=conv-1')).toBe(true)
  expect(screen.getByRole('link', { name: 'Open document' })).toHaveAttribute('href', '/api/documents/doc-1')
  expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute('href', 'https://example.com/source')
  expect(screen.getByRole('link', { name: 'View integration' })).toHaveAttribute('href', '/dashboard/integrations/datatruck')
  expect(screen.queryAllByText('No activity yet.')).toHaveLength(0)
  expect(document.body.textContent).not.toContain('undefined')
  expect(document.body.textContent).not.toContain('null')
})

it('shows empty states cleanly when the workspace has no activity', () => {
  renderActivity({
    totals: {
      knowledgeItems: 0,
      questionsAsked: 0,
      documents: 0,
      activeSources: 0,
      activeUsers: 0,
      syncs: 0,
    },
    activityByDay: [
      { date: '2026-07-02', label: 'Thu', count: 0 },
      { date: '2026-07-03', label: 'Fri', count: 0 },
      { date: '2026-07-04', label: 'Sat', count: 0 },
      { date: '2026-07-05', label: 'Sun', count: 0 },
      { date: '2026-07-06', label: 'Mon', count: 0 },
      { date: '2026-07-07', label: 'Tue', count: 0 },
      { date: '2026-07-08', label: 'Wed', count: 0 },
    ],
    sources: [],
    frequentQuestions: [],
    integrationHealth: [],
    recentKnowledge: [],
    activeUsers: [],
    needsAttention: [],
    feed: { total: 0, page: 1, limit: 30, events: [] },
  })

  expect(screen.getAllByText('No activity yet.').length).toBeGreaterThan(0)
  expect(screen.getByText('Connect integrations to see activity.')).toBeInTheDocument()
  expect(screen.getByText('Questions will appear here.')).toBeInTheDocument()
  expect(screen.getByText('No active users yet.')).toBeInTheDocument()
  expect(screen.getByText('All clear. No issues found.')).toBeInTheDocument()
  expect(screen.getByText('New knowledge will appear here.')).toBeInTheDocument()
  expect(screen.getByText('No integration health data yet.')).toBeInTheDocument()
})

it('expands and collapses recent activity in five-item steps', async () => {
  renderActivity()

  expect(screen.queryByText('Conflict detected in a knowledge item')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
  expect(screen.getByText('Conflict detected in a knowledge item')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
  await waitFor(() => {
    expect(screen.queryByText('Conflict detected in a knowledge item')).not.toBeInTheDocument()
  })
})

it('keeps filters working and refreshes the feed from the API', async () => {
  renderActivity()

  fireEvent.click(screen.getByRole('button', { name: 'Syncs' }))

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith('/api/activity?page=1&limit=30&eventType=sync')
  })
  expect(await screen.findByText('Synced Gmail')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
})
