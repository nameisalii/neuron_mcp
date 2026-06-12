/**
 * @jest-environment node
 */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { generateEmbedding, openai } from '@/lib/openai'
import { searchSimilar } from '@/lib/pinecone'
import { trackEvent } from '@/lib/activity'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    workspace: { findUnique: jest.fn() },
    notionChunk: { findMany: jest.fn() },
    knowledgeItem: { findMany: jest.fn() },
    queryLog: { create: jest.fn() },
  },
}))
jest.mock('@/lib/openai', () => ({
  generateEmbedding: jest.fn(),
  openai: { chat: { completions: { create: jest.fn() } } },
}))
jest.mock('@/lib/pinecone', () => ({ searchSimilar: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockWorkspaceFind = jest.mocked(prisma.workspace.findUnique)
const mockChunkFindMany = jest.mocked(prisma.notionChunk.findMany)
const mockQueryLogCreate = jest.mocked(prisma.queryLog.create)
const mockEmbed = jest.mocked(generateEmbedding)
const mockSearch = jest.mocked(searchSimilar)
const mockChat = jest.mocked(openai.chat.completions.create)
const mockTrackEvent = jest.mocked(trackEvent)

const CLERK_ID = 'user-clerk-1'
const WORKSPACE_ID = 'ws-1'
const DISPLAY_NAME = 'Ali Z'
const WORKSPACE_NAME = 'Acme Corp'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockStream(content: string) {
  return (async function* () {
    yield { choices: [{ delta: { content }, finish_reason: null }] }
    yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
  })()
}

async function readSSE(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text()
  return text
    .split('\n\n')
    .filter((block) => block.trimStart().startsWith('data: '))
    .map((block) => JSON.parse(block.replace(/^data: /, '').trim()))
}

const mockEmbedding = new Array(1536).fill(0.1)
const mockChunk = {
  id: 'chunk-1',
  pineconeId: 'pin-1',
  content: 'Refunds over $500 need manager approval',
  blockType: 'paragraph',
  labels: ['rule'],
  labeledBy: [{ userId: CLERK_ID, displayName: DISPLAY_NAME, label: 'rule', at: '2025-01-01' }],
  workspaceId: WORKSPACE_ID,
  page: { title: 'Policy Doc', notionPageId: 'notion-abc' },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: WORKSPACE_ID } } as never)
  mockMemberFind.mockResolvedValue({ role: 'member', status: 'active', displayName: DISPLAY_NAME, department: 'Engineering' } as never)
  mockWorkspaceFind.mockResolvedValue({ id: WORKSPACE_ID, name: WORKSPACE_NAME, type: 'team' } as never)
  mockEmbed.mockResolvedValue(mockEmbedding)
  mockSearch.mockResolvedValue([{ id: 'pin-1', score: 0.88 }])
  mockChunkFindMany.mockResolvedValue([mockChunk] as never)
  jest.mocked(prisma.knowledgeItem.findMany).mockResolvedValue([] as never)
  mockQueryLogCreate.mockResolvedValue({ id: 'log-1' } as never)
  mockTrackEvent.mockResolvedValue(undefined)
  mockChat.mockResolvedValue(mockStream('Refunds over $500 require manager approval.') as never)
})

describe('POST /api/query', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 400 when question is fewer than 3 characters', async () => {
    const res = await POST(makeRequest({ question: 'hi' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when question exceeds 500 characters', async () => {
    const res = await POST(makeRequest({ question: 'a'.repeat(501) }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when user has no workspace', async () => {
    mockUserFind.mockResolvedValue(null)
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not a workspace member', async () => {
    mockMemberFind.mockResolvedValue(null as never)
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(403)
  })

  it('calls searchSimilar with workspaceId metadata filter', async () => {
    await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(mockSearch).toHaveBeenCalledWith(mockEmbedding, WORKSPACE_ID, 10, 0.3)
  })

  it('calls searchSimilar exactly once (no dual-namespace search)', async () => {
    await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(mockSearch).toHaveBeenCalledTimes(1)
  })

  it('fetches NotionChunks by pineconeId from both namespaces', async () => {
    await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(mockChunkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pineconeId: { in: expect.any(Array) } }),
      }),
    )
  })

  it('uses gpt-4o for synthesis', async () => {
    await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(mockChat).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o' }))
  })

  it('streams response with delta events', async () => {
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(200)
    const events = await readSSE(res)
    const deltas = events.filter((e) => e.type === 'delta')
    expect(deltas.length).toBeGreaterThan(0)
    const fullText = deltas.map((e) => e.content).join('')
    expect(fullText).toContain('Refunds')
  })

  it('includes done event with sources and confidence', async () => {
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    const events = await readSSE(res)
    const done = events.find((e) => e.type === 'done')
    expect(done).toBeDefined()
    expect(done!.sources).toBeDefined()
    expect(typeof done!.confidence).toBe('number')
  })

  it('includes workspace name in system prompt', async () => {
    await POST(makeRequest({ question: 'What is the refund policy?' }))
    const call = mockChat.mock.calls[0][0]
    const systemMsg = (call.messages as Array<{ role: string; content: string }>).find((m) => m.role === 'system')
    expect(systemMsg?.content).toContain(WORKSPACE_NAME)
  })

  it('includes displayName and role in system prompt', async () => {
    await POST(makeRequest({ question: 'What is the refund policy?' }))
    const call = mockChat.mock.calls[0][0]
    const systemMsg = (call.messages as Array<{ role: string; content: string }>).find((m) => m.role === 'system')
    expect(systemMsg?.content).toContain(DISPLAY_NAME)
    expect(systemMsg?.content).toContain('member')
  })

  it('escapes XML special characters in the question', async () => {
    await POST(makeRequest({ question: 'What is <b>the</b> policy & rules?' }))
    const call = mockChat.mock.calls[0][0]
    const userMsg = (call.messages as Array<{ role: string; content: string }>).find((m) => m.role === 'user')
    expect(userMsg?.content).toContain('&lt;b&gt;')
    expect(userMsg?.content).toContain('&amp;')
    expect(userMsg?.content).not.toContain('<b>')
  })

  it('saves a QueryLog with userId and displayName', async () => {
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    await res.text() // consume stream so async start() completes
    expect(mockQueryLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          userId: CLERK_ID,
          displayName: DISPLAY_NAME,
          query: expect.any(String),
        }),
      }),
    )
  })

  it('creates an ActivityEvent with the question', async () => {
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    await res.text() // consume stream so async start() completes
    expect(mockTrackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CLERK_ID,
      DISPLAY_NAME,
      'query',
      expect.stringContaining('asked'),
      expect.any(Object),
    )
  })

  it('returns no-information SSE done event when no chunks found', async () => {
    mockSearch.mockResolvedValue([])
    mockChunkFindMany.mockResolvedValue([] as never)
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(200)
    const events = await readSSE(res)
    const done = events.find((e) => e.type === 'done')
    expect(done!.confidence).toBe(0)
  })

  it('returns 500 on unexpected upstream error', async () => {
    mockEmbed.mockRejectedValue(new Error('OpenAI down'))
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('Internal server error')
  })
})
