/**
 * @jest-environment node
 */
import { runNotionBackgroundSync, processSlackMessage } from '../background'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { deleteEmbeddings, upsertEmbedding } from '@/lib/pinecone'
import { extractKnowledge } from '@/lib/extraction/extractor'
import { evaluateCapture } from '../capture-rules'

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockNotionSearch = jest.fn()
const mockBlocksList = jest.fn()

jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    search: mockNotionSearch,
    blocks: { children: { list: mockBlocksList } },
  })),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    syncStatus: { findUnique: jest.fn(), upsert: jest.fn() },
    notionPage: { upsert: jest.fn() },
    notionChunk: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    knowledgeItem: { findMany: jest.fn(), deleteMany: jest.fn() },
    captureLog: { create: jest.fn() },
  },
}))

jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn(), deleteEmbeddings: jest.fn() }))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledge: jest.fn() }))
jest.mock('../capture-rules', () => ({ evaluateCapture: jest.fn() }))

// ─── typed refs ───────────────────────────────────────────────────────────────

const mockSyncStatusFind = jest.mocked(prisma.syncStatus.findUnique)
const mockSyncStatusUpsert = jest.mocked(prisma.syncStatus.upsert)
const mockPageUpsert = jest.mocked(prisma.notionPage.upsert)
const mockChunkCreateMany = jest.mocked(prisma.notionChunk.createMany)
const mockChunkDeleteMany = jest.mocked(prisma.notionChunk.deleteMany)
const mockChunkFindMany = jest.mocked(prisma.notionChunk.findMany)
const mockKnowledgeFindMany = jest.mocked(prisma.knowledgeItem.findMany)
const mockKnowledgeDeleteMany = jest.mocked(prisma.knowledgeItem.deleteMany)
const mockCaptureLogCreate = jest.mocked(prisma.captureLog.create)
const mockEmbed = jest.mocked(generateEmbedding)
const mockUpsertEmb = jest.mocked(upsertEmbedding)
const mockDeleteEmbeddings = jest.mocked(deleteEmbeddings)
const mockExtract = jest.mocked(extractKnowledge)
const mockEvaluate = jest.mocked(evaluateCapture)

const WS = 'ws-1'

function makePage(id: string, lastEdited: string) {
  return {
    object: 'page',
    id,
    last_edited_time: lastEdited,
    parent: { type: 'workspace', workspace: true },
    properties: { title: { type: 'title', title: [{ plain_text: `Page ${id}` }] } },
    url: `https://notion.so/${id}`,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NOTION_TOKEN = 'test-token'
  mockSyncStatusFind.mockResolvedValue(null)
  mockSyncStatusUpsert.mockResolvedValue({} as never)
  mockPageUpsert.mockResolvedValue({ id: 'db-page-1' } as never)
  mockChunkDeleteMany.mockResolvedValue({ count: 0 } as never)
  mockChunkCreateMany.mockResolvedValue({ count: 1 } as never)
  mockChunkFindMany.mockResolvedValue([{ id: 'chunk-1' }] as never)
  mockKnowledgeFindMany.mockResolvedValue([])
  mockKnowledgeDeleteMany.mockResolvedValue({ count: 0 })
  mockCaptureLogCreate.mockResolvedValue({} as never)
  mockEmbed.mockResolvedValue(new Array(1536).fill(0.1))
  mockUpsertEmb.mockResolvedValue(undefined)
  mockDeleteEmbeddings.mockResolvedValue(undefined)
  mockExtract.mockResolvedValue([])
  mockEvaluate.mockResolvedValue({ decision: 'capture', reason: 'no_rules_configured' })
  mockBlocksList.mockResolvedValue({ results: [{ type: 'paragraph', id: 'b1', paragraph: { rich_text: [{ plain_text: 'Hello world' }] } }], next_cursor: null })
})

// ─── runNotionBackgroundSync ──────────────────────────────────────────────────

describe('runNotionBackgroundSync', () => {
  it('returns early without calling Notion API when status is paused', async () => {
    mockSyncStatusFind.mockResolvedValue({ status: 'paused', lastSyncAt: null, configuredBy: 'user-1' } as never)
    const result = await runNotionBackgroundSync(WS)
    expect(result).toEqual({ pages: 0, chunks: 0, skipped: 0, failed: [] })
    expect(mockNotionSearch).not.toHaveBeenCalled()
  })

  it('skips pages with last_edited_time older than sinceDate', async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1hr ago
    mockSyncStatusFind.mockResolvedValue({ status: 'active', lastSyncAt: new Date(), configuredBy: 'u1' } as never)
    mockNotionSearch.mockResolvedValue({ results: [makePage('p1', old)], next_cursor: null })

    const result = await runNotionBackgroundSync(WS)
    expect(result.skipped).toBe(1)
    expect(result.pages).toBe(0)
    expect(mockEvaluate).not.toHaveBeenCalled()
  })

  it('calls evaluateCapture for recent pages', async () => {
    const recent = new Date(Date.now() + 1000).toISOString()
    mockSyncStatusFind.mockResolvedValue({ status: 'active', lastSyncAt: new Date(Date.now() - 10000), configuredBy: 'u1' } as never)
    mockNotionSearch.mockResolvedValue({ results: [makePage('p1', recent)], next_cursor: null })

    await runNotionBackgroundSync(WS)
    expect(mockEvaluate).toHaveBeenCalledWith(WS, expect.objectContaining({ integration: 'notion', sourceId: 'p1' }))
  })

  it('writes CaptureLog for each evaluated page', async () => {
    const recent = new Date(Date.now() + 1000).toISOString()
    mockSyncStatusFind.mockResolvedValue({ status: 'active', lastSyncAt: new Date(Date.now() - 10000), configuredBy: 'u1' } as never)
    mockNotionSearch.mockResolvedValue({ results: [makePage('p1', recent)], next_cursor: null })

    await runNotionBackgroundSync(WS)
    expect(mockCaptureLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: WS, source: 'notion', sourceId: 'p1' }) }),
    )
  })

  it('skips processing when evaluateCapture returns skip', async () => {
    const recent = new Date(Date.now() + 1000).toISOString()
    mockSyncStatusFind.mockResolvedValue({ status: 'active', lastSyncAt: new Date(Date.now() - 10000), configuredBy: 'u1' } as never)
    mockNotionSearch.mockResolvedValue({ results: [makePage('p1', recent)], next_cursor: null })
    mockEvaluate.mockResolvedValue({ decision: 'skip', reason: 'no_include_rule_matched' })

    const result = await runNotionBackgroundSync(WS)
    expect(result.pages).toBe(0)
    expect(mockPageUpsert).not.toHaveBeenCalled()
  })

  it('upserts SyncStatus after run', async () => {
    mockSyncStatusFind.mockResolvedValue({ status: 'active', lastSyncAt: new Date(Date.now() - 10000), configuredBy: 'u1' } as never)
    mockNotionSearch.mockResolvedValue({ results: [], next_cursor: null })

    await runNotionBackgroundSync(WS)
    expect(mockSyncStatusUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId_integration: { workspaceId: WS, integration: 'notion' } } }),
    )
  })

  it('extracts categorized knowledge with Notion page attribution', async () => {
    const recent = new Date(Date.now() + 1000).toISOString()
    mockSyncStatusFind.mockResolvedValue({ status: 'active', lastSyncAt: new Date(Date.now() - 10000), configuredBy: 'u1' } as never)
    mockNotionSearch.mockResolvedValue({ results: [makePage('p1', recent)], next_cursor: null })

    await runNotionBackgroundSync(WS)

    expect(mockExtract).toHaveBeenCalledWith(
      expect.any(Array),
      WS,
      'notion',
      'https://notion.so/p1',
      'p1',
      { id: 'db-page-1', title: 'Page p1' },
    )
  })
})

// ─── processSlackMessage ──────────────────────────────────────────────────────

describe('processSlackMessage', () => {
  const event = { channel: 'C001', user: 'U1', text: 'Deploy on Tuesdays', ts: '1000.0' }

  it('returns early without extracting when status is paused', async () => {
    mockSyncStatusFind.mockResolvedValue({ status: 'paused' } as never)
    await processSlackMessage(WS, event)
    expect(mockEvaluate).not.toHaveBeenCalled()
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('calls evaluateCapture with correct item', async () => {
    await processSlackMessage(WS, event)
    expect(mockEvaluate).toHaveBeenCalledWith(WS, expect.objectContaining({ integration: 'slack', sourceId: 'C001' }))
  })

  it('writes CaptureLog regardless of decision', async () => {
    mockEvaluate.mockResolvedValue({ decision: 'skip', reason: 'no_include_rule_matched' })
    await processSlackMessage(WS, event)
    expect(mockCaptureLogCreate).toHaveBeenCalled()
  })

  it('calls extractKnowledge when decision is capture', async () => {
    await processSlackMessage(WS, event)
    expect(mockExtract).toHaveBeenCalledWith(
      [expect.objectContaining({ text: event.text, channel: event.channel })],
      WS,
    )
  })

  it('does not call extractKnowledge when decision is skip', async () => {
    mockEvaluate.mockResolvedValue({ decision: 'skip', reason: 'no_include_rule_matched' })
    await processSlackMessage(WS, event)
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('upserts SyncStatus after capturing', async () => {
    await processSlackMessage(WS, event)
    expect(mockSyncStatusUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId_integration: { workspaceId: WS, integration: 'slack' } } }),
    )
  })
})
