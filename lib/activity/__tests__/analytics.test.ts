import { prisma } from '@/lib/db'
import { getBrainActivityAnalytics } from '../analytics'

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    documentAttachment: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    activityEvent: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    chatMessage: {
      findMany: jest.fn(),
    },
    integration: {
      findMany: jest.fn(),
    },
    apiConnector: {
      findMany: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as any

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-07-08T12:00:00Z'))
  jest.clearAllMocks()

  mockPrisma.knowledgeItem.count.mockImplementation(async (args: any) => {
    const { where } = args ?? {}
    if ((where as { verified?: boolean | null })?.verified === false) return 3 as never
    return 6 as never
  })
  mockPrisma.knowledgeItem.findMany.mockResolvedValue([
    {
      id: 'ki-1',
      content: 'Datatruck load 12345 status updated to delivered with POD attached.',
      source: 'datatruck',
      category: 'fact',
      verified: true,
      updatedAt: new Date('2026-07-08T11:15:00Z'),
      sourceUrl: 'https://example.com/load-12345',
      sourceExternalId: '12345',
      sourceMetadata: { recordType: 'load' },
      sourceCreatedAt: new Date('2026-07-08T11:00:00Z'),
    },
    {
      id: 'ki-2',
      content: 'Customer CTA and public website point to tryneuron.net.',
      source: 'gmail',
      category: 'reference',
      verified: false,
      updatedAt: new Date('2026-07-08T10:30:00Z'),
      sourceUrl: null,
      sourceExternalId: 'thread-1',
      sourceMetadata: { subject: 'Website CTA' },
      sourceCreatedAt: new Date('2026-07-08T10:00:00Z'),
    },
  ] as never)
  mockPrisma.documentAttachment.count.mockImplementation(async (args: any) => {
    const { where } = args ?? {}
    if (((where as { extractionStatus?: { in?: string[] } })?.extractionStatus?.in ?? []).includes('failed')) return 2 as never
    return 4 as never
  })
  mockPrisma.activityEvent.count.mockImplementation(async (args: any) => {
    const { where } = args ?? {}
    const filter = where as { eventType?: string }
    if (filter?.eventType === 'query') return 5 as never
    if (filter?.eventType === 'sync') return 2 as never
    if (filter?.eventType === 'conflict_detected') return 1 as never
    return 8 as never
  })
  mockPrisma.activityEvent.findMany.mockImplementation(async (args: any) => {
    const { orderBy, take } = args ?? {}
    const rows = [
      {
        id: 'event-1',
        userId: 'u-1',
        displayName: 'Ali',
        eventType: 'sync',
        description: 'Synced Datatruck',
        metadata: { integration: 'datatruck', sourceUrl: 'https://example.com/source', documentId: 'doc-1', conversationId: 'conv-1' },
        createdAt: new Date('2026-07-08T09:00:00Z'),
      },
      {
        id: 'event-2',
        userId: 'u-2',
        displayName: 'Mina',
        eventType: 'label',
        description: 'Updated labels',
        metadata: null,
        createdAt: new Date('2026-07-07T09:00:00Z'),
      },
      {
        id: 'event-3',
        userId: 'u-1',
        displayName: 'Ali',
        eventType: 'query',
        description: 'Asked: what changed in Telegram today?',
        metadata: { conversationId: 'conv-2' },
        createdAt: new Date('2026-07-06T09:00:00Z'),
      },
    ]
    if ((orderBy as any)?.createdAt === 'desc' || take) return rows.slice(0, typeof take === 'number' ? take : rows.length) as never
    return rows as never
  })
  mockPrisma.chatMessage.findMany.mockResolvedValue([
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      userId: 'u-1',
      content: 'Find BOL for load 12345',
      createdAt: new Date('2026-07-08T10:00:00Z'),
    },
    {
      id: 'msg-2',
      conversationId: 'conv-2',
      userId: 'u-2',
      content: 'What changed in Telegram today?',
      createdAt: new Date('2026-07-08T09:00:00Z'),
    },
    {
      id: 'msg-3',
      conversationId: 'conv-3',
      userId: 'u-1',
      content: 'Find BOL for load 12345',
      createdAt: new Date('2026-07-07T09:00:00Z'),
    },
  ] as never)
  mockPrisma.integration.findMany.mockResolvedValue([
    { type: 'gmail', accessToken: 'token', metadata: { status: 'connected' }, lastSyncAt: new Date('2026-07-08T08:00:00Z') },
    { type: 'slack', accessToken: 'token', metadata: { status: 'connected' }, lastSyncAt: new Date('2026-07-08T08:30:00Z') },
    { type: 'notion', accessToken: 'token', metadata: { status: 'connected' }, lastSyncAt: new Date('2026-07-08T09:00:00Z') },
  ] as never)
  mockPrisma.apiConnector.findMany.mockResolvedValue([
    { sourceKey: 'datatruck', status: 'sync_error', metadata: { lastSyncSummary: { warnings: ['endpoint timeout'] } }, encryptedCredential: 'enc', lastSyncAt: new Date('2026-07-08T08:45:00Z') },
    { sourceKey: 'other', status: 'not_configured', metadata: null, encryptedCredential: null, lastSyncAt: null },
  ] as never)
  mockPrisma.knowledgeItem.groupBy.mockResolvedValue([
    { source: 'datatruck', _count: { _all: 4 } },
    { source: 'gmail', _count: { _all: 2 } },
  ] as never)
  mockPrisma.documentAttachment.groupBy.mockResolvedValue([
    { source: 'datatruck', _count: { _all: 1 } },
    { source: 'gmail', _count: { _all: 1 } },
  ] as never)
})

afterEach(() => {
  jest.useRealTimers()
})

it('summarizes brain activity with totals, charts, sources, questions, users, and alerts', async () => {
  const analytics = await getBrainActivityAnalytics('workspace-1', [
    { userId: 'u-1', displayName: 'Ali' },
    { userId: 'u-2', displayName: 'Mina' },
  ])

  expect(analytics.totals).toEqual({
    knowledgeItems: 6,
    questionsAsked: 5,
    documents: 4,
    activeSources: 4,
    activeUsers: 2,
    syncs: 2,
  })
  expect(analytics.activityByDay).toHaveLength(7)
  expect(analytics.sources[0]).toMatchObject({ source: 'datatruck', label: 'Datatruck', count: 5 })
  expect(analytics.frequentQuestions[0]).toMatchObject({ label: 'Find BOL for load 12345', count: 2 })
  expect(analytics.activeUsers[0]).toMatchObject({ userId: 'u-1', displayName: 'Ali' })
  expect(analytics.integrationHealth).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: 'datatruck', status: 'sync_warning' }),
  ]))
  expect(analytics.recentKnowledge[0]).toMatchObject({ source: 'datatruck', verified: true })
  expect(analytics.needsAttention.map((item) => item.label)).toEqual(expect.arrayContaining([
    '2 documents need attention',
    '1 integration has sync warnings',
    '3 unverified knowledge items',
    '1 conflict detected',
  ]))
  expect(analytics.feed.events).toHaveLength(3)
  expect(analytics.feed.total).toBe(8)
})
