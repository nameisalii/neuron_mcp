/**
 * @jest-environment node
 */
import { detectConflicts } from '../conflict-detector'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { searchInNamespace } from '@/lib/pinecone'

jest.mock('@/lib/db', () => ({
  prisma: {
    notionChunk: { findUnique: jest.fn(), findFirst: jest.fn() },
    alert: { findFirst: jest.fn(), create: jest.fn() },
  },
}))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ searchInNamespace: jest.fn() }))

const mockChunkFind = jest.mocked(prisma.notionChunk.findUnique)
const mockChunkFindFirst = jest.mocked(prisma.notionChunk.findFirst)
const mockAlertFind = jest.mocked(prisma.alert.findFirst)
const mockAlertCreate = jest.mocked(prisma.alert.create)
const mockEmbed = jest.mocked(generateEmbedding)
const mockSearch = jest.mocked(searchInNamespace)

const WS = 'ws-1'
const EMBEDDING = new Array(1536).fill(0.1)

beforeEach(() => {
  jest.clearAllMocks()
  mockEmbed.mockResolvedValue(EMBEDDING)
  mockSearch.mockResolvedValue([])
  mockAlertFind.mockResolvedValue(null)
  mockAlertCreate.mockResolvedValue({} as never)
})

describe('detectConflicts', () => {
  it('returns early when chunk not found', async () => {
    mockChunkFind.mockResolvedValue(null)
    await detectConflicts(WS, 'chunk-1')
    expect(mockEmbed).not.toHaveBeenCalled()
  })

  it('returns early when chunk has no pineconeId', async () => {
    mockChunkFind.mockResolvedValue({ id: 'c1', content: 'text', pineconeId: null, workspaceId: WS } as never)
    await detectConflicts(WS, 'c1')
    expect(mockEmbed).not.toHaveBeenCalled()
  })

  it('searches with 0.85 min score', async () => {
    mockChunkFind.mockResolvedValue({ id: 'c1', content: 'Deploy on Tuesdays', pineconeId: 'pin-1', workspaceId: WS } as never)
    await detectConflicts(WS, 'c1')
    expect(mockSearch).toHaveBeenCalledWith(EMBEDDING, WS, 5, 0.85)
  })

  it('skips self match (same pineconeId)', async () => {
    mockChunkFind.mockResolvedValue({ id: 'c1', content: 'Deploy on Tuesdays', pineconeId: 'pin-1', workspaceId: WS } as never)
    mockSearch.mockResolvedValue([{ id: 'pin-1', score: 0.95 }])
    await detectConflicts(WS, 'c1')
    expect(mockChunkFindFirst).not.toHaveBeenCalled()
  })

  it('skips match with high word overlap (not a conflict)', async () => {
    mockChunkFind.mockResolvedValue({ id: 'c1', content: 'Deploy on Tuesdays only', pineconeId: 'pin-1', workspaceId: WS } as never)
    mockSearch.mockResolvedValue([{ id: 'pin-2', score: 0.92 }])
    // Same words — high overlap
    mockChunkFindFirst.mockResolvedValue({ id: 'c2', content: 'Deploy on Tuesdays only please' } as never)
    await detectConflicts(WS, 'c1')
    expect(mockAlertCreate).not.toHaveBeenCalled()
  })

  it('creates conflict alert for semantically similar but textually different chunks', async () => {
    mockChunkFind.mockResolvedValue({ id: 'c1', content: 'Deploy every Tuesday morning', pineconeId: 'pin-1', workspaceId: WS } as never)
    mockSearch.mockResolvedValue([{ id: 'pin-2', score: 0.90 }])
    mockChunkFindFirst.mockResolvedValue({ id: 'c2', content: 'Never deploy on weekdays use Friday only' } as never)
    await detectConflicts(WS, 'c1')
    expect(mockAlertCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'conflict', workspaceId: WS }) }),
    )
  })

  it('skips creating duplicate conflict alert', async () => {
    mockChunkFind.mockResolvedValue({ id: 'c1', content: 'Deploy every Tuesday morning', pineconeId: 'pin-1', workspaceId: WS } as never)
    mockSearch.mockResolvedValue([{ id: 'pin-2', score: 0.90 }])
    mockChunkFindFirst.mockResolvedValue({ id: 'c2', content: 'Never deploy on weekdays use Friday only' } as never)
    mockAlertFind.mockResolvedValue({ id: 'existing-alert' } as never)
    await detectConflicts(WS, 'c1')
    expect(mockAlertCreate).not.toHaveBeenCalled()
  })
})
