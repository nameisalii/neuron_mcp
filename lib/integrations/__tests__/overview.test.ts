import { loadIntegrationOverview, parseIntegrationFilter } from '../overview'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    integration: { findUnique: jest.fn() },
    knowledgeItem: { count: jest.fn(), findMany: jest.fn() },
    notionPage: { count: jest.fn(), findMany: jest.fn() },
    notionChunk: { count: jest.fn() },
    emailThread: { count: jest.fn() },
    emailChunk: { count: jest.fn() },
  },
}))

const mockPrisma = jest.mocked(prisma)

beforeEach(() => {
  jest.resetAllMocks()
})

describe('integration overview helper', () => {
  it('falls back to All for invalid filters', () => {
    expect(parseIntegrationFilter('bogus')).toBe('all')
  })

  it('scopes Gmail overview to the owner personal namespace', async () => {
    mockPrisma.integration.findUnique.mockResolvedValue({
      lastSyncAt: new Date('2026-06-12T00:00:00.000Z'),
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      channels: [],
      teamId: null,
      teamName: null,
      metadata: {
        configured: true,
        selectedLabels: ['INBOX', 'SENT'],
        selectedLabelNames: ['Inbox', 'Sent'],
        privacy: 'personal',
      },
    } as never)
    const knowledgeCountMock = mockPrisma.knowledgeItem.count as unknown as jest.Mock
    knowledgeCountMock.mockImplementation(async (args) => {
      const where = args?.where as Record<string, unknown> | undefined
      if (!where?.category) return 1
      return where.category === 'decision' ? 1 : 0
    })
    mockPrisma.knowledgeItem.findMany.mockResolvedValue([
      {
        id: 'gmail-1',
        content: 'Email from Alice about launch: We decided to delay launch.',
        category: 'decision',
        source: 'gmail',
        sourceUrl: 'https://mail.google.com',
        sourceExternalId: 'thread-1',
        owner: 'alice@example.com',
        sourceCreatedAt: new Date('2026-06-12T00:00:00.000Z'),
        updatedAt: new Date('2026-06-12T01:00:00.000Z'),
        notionPageTitle: null,
      },
    ] as never)
    mockPrisma.emailThread.count.mockResolvedValue(1 as never)
    mockPrisma.emailChunk.count.mockResolvedValue(1 as never)

    const data = await loadIntegrationOverview('ws-1', 'user-1', 'gmail', 'all')

    expect(mockPrisma.knowledgeItem.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: 'ws-1',
        source: 'gmail',
        visibility: 'personal',
        visibilitySetBy: 'user-1',
      }),
    }))
    expect(data.privacyNote).toContain('personal')
    expect(data.summaryCards.find((card) => card.label === 'Threads')?.value).toBe('1')
    expect(data.filters.find((filter) => filter.key === 'all')?.count).toBe(1)
    expect(data.items[0]?.source).toBe('gmail')
  })

  it('builds notion overview metadata and filter counts', async () => {
    mockPrisma.integration.findUnique.mockResolvedValue({
      lastSyncAt: new Date('2026-06-11T00:00:00.000Z'),
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      channels: [],
      teamId: null,
      teamName: null,
      metadata: null,
    } as never)
    const notionCountMock = mockPrisma.knowledgeItem.count as unknown as jest.Mock
    notionCountMock.mockImplementation(async (args) => {
      const where = args?.where as Record<string, unknown> | undefined
      if (!where?.category) return 3
      if (where.category === 'decision') return 1
      if (where.category === 'idea') return 1
      return 0
    })
    mockPrisma.knowledgeItem.findMany.mockResolvedValue([] as never)
    mockPrisma.notionPage.count.mockResolvedValue(2 as never)
    mockPrisma.notionChunk.count.mockResolvedValue(4 as never)
    mockPrisma.notionPage.findMany.mockResolvedValue([
      { id: 'page-1', title: 'Product Plan', syncedAt: new Date('2026-06-10T00:00:00.000Z'), _count: { chunks: 2, knowledgeItems: 1 } },
    ] as never)

    const data = await loadIntegrationOverview('ws-1', 'user-1', 'notion', 'decisions')

    expect(data.summaryCards.some((card) => card.label === 'Pages')).toBe(true)
    expect(data.notionProjects?.[0]).toEqual(expect.objectContaining({ id: 'page-1', title: 'Product Plan' }))
    expect(data.filters.find((filter) => filter.key === 'decisions')?.count).toBe(1)
    expect(mockPrisma.notionPage.findMany.mock.calls[0]?.[0]).not.toHaveProperty('take')
  })
})
