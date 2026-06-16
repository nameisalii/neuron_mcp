/**
 * @jest-environment node
 */
import { extractKnowledge, extractKnowledgeDetailed } from '../extractor'
import { openai, generateEmbedding } from '@/lib/openai'
import { searchSimilar, searchInNamespace, upsertEmbedding, upsertEmbeddingInNamespace } from '@/lib/pinecone'
import { prisma } from '@/lib/db'
import type { SlackMessage } from '@/types'

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/openai', () => ({
  openai: { chat: { completions: { create: jest.fn() } } },
  generateEmbedding: jest.fn(),
}))

jest.mock('@/lib/pinecone', () => ({
  searchSimilar: jest.fn(),
  searchInNamespace: jest.fn(),
  upsertEmbedding: jest.fn(),
  upsertEmbeddingInNamespace: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

// ─── typed references ─────────────────────────────────────────────────────────

const mockChatCreate = jest.mocked(openai.chat.completions.create)
const mockGenerateEmbedding = jest.mocked(generateEmbedding)
const mockSearchSimilar = jest.mocked(searchSimilar)
const mockSearchInNamespace = jest.mocked(searchInNamespace)
const mockUpsertEmbedding = jest.mocked(upsertEmbedding)
const mockUpsertEmbeddingInNamespace = jest.mocked(upsertEmbeddingInNamespace)
const mockCreate = jest.mocked(prisma.knowledgeItem.create)
const mockFindUnique = jest.mocked(prisma.knowledgeItem.findUnique)
const mockFindFirst = jest.mocked(prisma.knowledgeItem.findFirst)
const mockKnowledgeUpdate = jest.mocked(prisma.knowledgeItem.update)

// ─── fixtures ─────────────────────────────────────────────────────────────────

const mockEmbedding = new Array(1536).fill(0.1)

const twoMessages: SlackMessage[] = [
  { text: 'Refunds over $500 need manager approval', user: 'U1', channel: 'C1', ts: '1.0' },
  { text: 'We deploy every Tuesday', user: 'U2', channel: 'C1', ts: '2.0' },
]

let itemCounter = 0
function extraction(items: object[]) {
  return { choices: [{ message: { content: JSON.stringify(items) } }] } as never
}
function conflict(isConflict: boolean) {
  const line = isConflict ? 'CONFLICT: YES' : 'CONFLICT: NO'
  return { choices: [{ message: { content: `${line}\nREASON: test.` } }] } as never
}

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  itemCounter = 0
  jest.clearAllMocks()
  mockGenerateEmbedding.mockResolvedValue(mockEmbedding)
  mockFindUnique.mockResolvedValue(null)
  mockSearchSimilar.mockResolvedValue([])
  mockSearchInNamespace.mockResolvedValue([])
  mockUpsertEmbedding.mockResolvedValue(undefined)
  mockUpsertEmbeddingInNamespace.mockResolvedValue(undefined)
  mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: `item-${++itemCounter}`, ...data }) as never
  )
})

// ─── tests ────────────────────────────────────────────────────────────────────

describe('extractKnowledge', () => {
  it('saves and returns items from valid LLM extraction', async () => {
    mockChatCreate.mockResolvedValue(extraction([
      { content: 'Refunds over $500 need manager approval', category: 'rule', owner: null, confidence: 0.9 },
    ]))

    const result = await extractKnowledge(twoMessages, 'ws-1')

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Refunds over $500 need manager approval')
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(1)
  })

  it('keeps items at confidence >= 0.4 and drops items below it', async () => {
    mockChatCreate.mockResolvedValue(extraction([
      { content: 'Strong rule', category: 'rule', owner: null, confidence: 0.85 },
      { content: 'Borderline fact', category: 'fact', owner: null, confidence: 0.4 },
      { content: 'Too weak', category: 'idea', owner: null, confidence: 0.39 },
    ]))

    const result = await extractKnowledge(twoMessages, 'ws-1')

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.confidence)).toEqual(expect.arrayContaining([0.85, 0.4]))
  })

  it('falls back when all extracted items are below confidence threshold', async () => {
    mockChatCreate.mockResolvedValue(extraction([
      { content: 'Too weak', category: 'idea', owner: null, confidence: 0.39 },
    ]))

    const result = await extractKnowledge(twoMessages, 'ws-1')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ category: 'fact', confidence: 0.55 })
  })

  it('extracts and stores items with category fact', async () => {
    mockChatCreate.mockResolvedValue(extraction([
      { content: 'Project X is a B2B HR tool in closed beta', category: 'fact', owner: null, confidence: 0.8 },
    ]))

    const result = await extractKnowledge(twoMessages, 'ws-1')

    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('fact')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ category: 'fact' }) })
    )
  })

  it('uses Gmail-specific guidance and accepts follow-up items', async () => {
    mockChatCreate.mockResolvedValue(extraction([
      { content: 'Send the refund policy by Friday', category: 'follow_up', owner: null, confidence: 0.9 },
      { content: 'Customers can get a full refund within 30 days', category: 'rule', owner: null, confidence: 0.9 },
    ]))

    const result = await extractKnowledgeDetailed(twoMessages, 'ws-1', 'gmail')

    expect(result.items.map((item) => item.category)).toEqual(['follow_up', 'rule'])
    expect(mockChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('private personal memory from email'),
        }),
      ]),
    }))
  })

  it('uses the personal namespace for Gmail duplicate checks and embeddings', async () => {
    mockChatCreate.mockResolvedValue(extraction([
      { content: 'Product Hunt launch is delayed until integrations are stable', category: 'decision', owner: null, confidence: 0.9 },
    ]))

    await extractKnowledge(twoMessages, 'ws-1', 'gmail', undefined, 'thread-1', undefined, {
      namespace: 'ws-1:user-1',
      visibility: 'personal',
      visibilitySetBy: 'user-1',
    })

    expect(mockSearchInNamespace).toHaveBeenCalledWith(mockEmbedding, 'ws-1:user-1', expect.any(Number), expect.any(Number))
    expect(mockSearchSimilar).not.toHaveBeenCalled()
    expect(mockUpsertEmbeddingInNamespace).toHaveBeenCalledWith(
      expect.any(String),
      mockEmbedding,
      expect.objectContaining({ source: 'gmail' }),
      'ws-1:user-1',
    )
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ visibility: 'personal', visibilitySetBy: 'user-1' }),
    }))
  })

  it('creates a fallback fact when LLM returns []', async () => {
    mockChatCreate.mockResolvedValue(extraction([]))

    const result = await extractKnowledgeDetailed(twoMessages, 'ws-1', 'slack')

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ category: 'fact', confidence: 0.55 })
    expect(result.diagnostics.fallbackItemsCreated).toBe(1)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        category: 'fact',
        source: 'slack',
        visibility: 'team',
      }),
    }))
  })

  it('skips chunk entirely on invalid JSON from LLM', async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'not json{{' } }] } as never)

    const result = await extractKnowledge(twoMessages, 'ws-1')

    expect(result).toHaveLength(0)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('generates one embedding per saved item', async () => {
    mockChatCreate.mockResolvedValue(extraction([
      { content: 'Rule A', category: 'rule', owner: null, confidence: 0.9 },
      { content: 'Rule B', category: 'rule', owner: null, confidence: 0.8 },
    ]))

    await extractKnowledge(twoMessages, 'ws-1')

    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(2)
  })

  it('saves item with frozen:false when no conflict exists', async () => {
    mockChatCreate.mockResolvedValue(extraction([
      { content: 'Deploy on Tuesdays', category: 'process', owner: null, confidence: 0.88 },
    ]))

    await extractKnowledge(twoMessages, 'ws-1')

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ frozen: false }) })
    )
  })

  it('splits 45 messages into 3 chunks of ≤20 and calls LLM 3 times', async () => {
    const many: SlackMessage[] = Array.from({ length: 45 }, (_, i) => ({
      text: `msg ${i}`, user: 'U1', channel: 'C1', ts: `${i}.0`,
    }))
    mockChatCreate.mockResolvedValue(extraction([]))

    await extractKnowledge(many, 'ws-1')

    expect(mockChatCreate).toHaveBeenCalledTimes(3)
  })

  it('keeps DB items when one embedding fails', async () => {
    mockChatCreate.mockResolvedValue(extraction([
      { content: 'Rule A', category: 'rule', owner: null, confidence: 0.9 },
      { content: 'Rule B', category: 'rule', owner: null, confidence: 0.85 },
    ]))
    mockGenerateEmbedding
      .mockRejectedValueOnce(new Error('embedding API error'))
      .mockResolvedValueOnce(mockEmbedding)

    const result = await extractKnowledge(twoMessages, 'ws-1')

    expect(result).toHaveLength(2)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  describe('deduplication', () => {
    it('skips item when a near-identical item already exists (score >= 0.95)', async () => {
      mockChatCreate.mockResolvedValue(extraction([
        { content: 'Deploy on Tuesdays', category: 'process', owner: null, confidence: 0.9 },
      ]))
      mockSearchSimilar.mockResolvedValue([{ id: 'existing-1', score: 0.97 }])

      const result = await extractKnowledge(twoMessages, 'ws-1')

      expect(result).toHaveLength(0)
      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpsertEmbedding).not.toHaveBeenCalled()
    })

    it('does not skip item when highest similarity is below duplicate threshold', async () => {
      mockChatCreate.mockResolvedValue(extraction([
        { content: 'Deploy on Tuesdays', category: 'process', owner: null, confidence: 0.9 },
      ]))
      mockSearchSimilar.mockResolvedValue([{ id: 'existing-1', score: 0.80 }])
      mockFindFirst.mockResolvedValue(null)

      const result = await extractKnowledge(twoMessages, 'ws-1')

      expect(result).toHaveLength(1)
      expect(mockCreate).toHaveBeenCalledTimes(1)
    })
  })

  describe('conflict detection', () => {
    it('marks new item frozen:true when LLM detects a conflict', async () => {
      mockChatCreate
        .mockResolvedValueOnce(extraction([
          { content: 'Refunds never allowed', category: 'rule', owner: null, confidence: 0.9 },
        ]))
        .mockResolvedValueOnce(conflict(true))

      mockSearchSimilar.mockResolvedValue([{ id: 'existing-1', score: 0.92 }])
      mockFindFirst.mockResolvedValue({ id: 'existing-1', content: 'All refunds approved' } as never)

      await extractKnowledge(twoMessages, 'ws-1')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ frozen: true }) })
      )
    })

    it('marks the existing conflicting DB item frozen:true', async () => {
      mockChatCreate
        .mockResolvedValueOnce(extraction([
          { content: 'Refunds never allowed', category: 'rule', owner: null, confidence: 0.9 },
        ]))
        .mockResolvedValueOnce(conflict(true))

      mockSearchSimilar.mockResolvedValue([{ id: 'existing-1', score: 0.92 }])
      mockFindFirst.mockResolvedValue({ id: 'existing-1', content: 'All refunds approved' } as never)

      await extractKnowledge(twoMessages, 'ws-1')

      expect(mockKnowledgeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-1' },
          data: expect.objectContaining({ frozen: true }),
        })
      )
    })

    it('does not freeze item when similar item has no conflict', async () => {
      mockChatCreate
        .mockResolvedValueOnce(extraction([
          { content: 'Deploy on Tuesdays', category: 'process', owner: null, confidence: 0.88 },
        ]))
        .mockResolvedValueOnce(conflict(false))

      mockSearchSimilar.mockResolvedValue([{ id: 'existing-2', score: 0.80 }])
      mockFindFirst.mockResolvedValue({ id: 'existing-2', content: 'Deployment schedule' } as never)

      await extractKnowledge(twoMessages, 'ws-1')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ frozen: false }) })
      )
      expect(mockKnowledgeUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ frozen: true }) })
      )
    })
  })
})
