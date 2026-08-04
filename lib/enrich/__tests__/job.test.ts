/** @jest-environment node */

import { prisma } from '@/lib/db'
import { resolveLinks } from '../resolveLinks'
import { createLinkedKnowledge } from '../createLinkedKnowledge'
import { runLinkEnrichment } from '../job'

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    activityEvent: { create: jest.fn() },
  },
}))
jest.mock('../resolveLinks', () => ({ resolveLinks: jest.fn() }))
jest.mock('../createLinkedKnowledge', () => ({ createLinkedKnowledge: jest.fn() }))

const item = (id: string, metadata: Record<string, unknown> = {}) => ({
  id,
  workspaceId: 'workspace-1',
  content: `See https://example.com/${id}`,
  summary: null,
  label: null,
  source: 'slack',
  sourceExternalId: id,
  sourceMetadata: metadata,
  visibility: 'team',
  visibilitySetBy: null,
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.FIRECRAWL_ENABLED = 'true'
  process.env.FIRECRAWL_API_KEY = 'test-key'
  jest.mocked(prisma.knowledgeItem.findMany).mockResolvedValue([item('one'), item('two')] as never)
  jest.mocked(prisma.knowledgeItem.update).mockResolvedValue({} as never)
  jest.mocked(prisma.activityEvent.create).mockResolvedValue({ id: 'activity-1' } as never)
  jest.mocked(createLinkedKnowledge).mockResolvedValue([{ id: 'child-1', created: true }])
  jest.mocked(resolveLinks).mockImplementation(async ({ item: parent }) => [{
    url: `https://example.com/${parent.id}`,
    normalizedUrl: `https://example.com/${parent.id}`,
    status: 'success',
    markdown: 'Page content',
    sourceUrl: `https://example.com/${parent.id}`,
    parentKnowledgeItemId: parent.id,
    visibility: parent.visibility,
    visibilitySetBy: parent.visibilitySetBy ?? null,
    metadata: { parentWorkspaceId: parent.workspaceId, parentSource: parent.source, cacheHit: false, crawlAttempted: true },
  }])
})

it('respects the run crawl budget and returns a safe summary', async () => {
  const summary = await runLinkEnrichment({ maxCrawls: 1, scanLimit: 10 })

  expect(summary.crawlsAttempted).toBeLessThanOrEqual(1)
  expect(summary).toEqual(expect.objectContaining({
    itemsScanned: 2,
    successes: 1,
    budgetExhausted: true,
  }))
  expect(createLinkedKnowledge).toHaveBeenCalledTimes(1)
})

it('skips a recently completed parent scan', async () => {
  jest.mocked(prisma.knowledgeItem.findMany).mockResolvedValue([
    item('one', {
      linkEnrichment: {
        scannedAt: '2026-07-28T11:30:00.000Z',
        status: 'complete',
      },
    }),
  ] as never)

  const summary = await runLinkEnrichment({
    maxCrawls: 2,
    scanLimit: 10,
    now: new Date('2026-07-28T12:00:00.000Z'),
  })

  expect(summary.parentsCurrent).toBe(1)
  expect(resolveLinks).not.toHaveBeenCalled()
})

it('does not create a child for an auth wall and stores a parent scan marker', async () => {
  jest.mocked(resolveLinks).mockResolvedValue([{
    url: 'https://example.com/private',
    normalizedUrl: 'https://example.com/private',
    status: 'auth_wall',
    sourceUrl: 'https://example.com/private',
    parentKnowledgeItemId: 'one',
    visibility: 'team',
    visibilitySetBy: null,
    metadata: { parentWorkspaceId: 'workspace-1', parentSource: 'slack', cacheHit: false, crawlAttempted: true },
  }])

  const summary = await runLinkEnrichment({ maxCrawls: 2, scanLimit: 10 })

  expect(summary.authWalls).toBeGreaterThan(0)
  expect(createLinkedKnowledge).not.toHaveBeenCalled()
  expect(prisma.knowledgeItem.update).toHaveBeenCalledWith(expect.objectContaining({
    data: {
      sourceMetadata: expect.objectContaining({
        linkEnrichment: expect.objectContaining({ status: 'complete', successCount: 0 }),
      }),
    },
  }))
})
