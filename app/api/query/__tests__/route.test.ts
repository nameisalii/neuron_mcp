/**
 * @jest-environment node
 */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { generateEmbedding, openai } from '@/lib/openai'
import { searchSimilar, searchInNamespace } from '@/lib/pinecone'
import { trackEvent } from '@/lib/activity'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    workspace: { findUnique: jest.fn() },
    notionChunk: { findMany: jest.fn() },
    knowledgeItem: { findMany: jest.fn() },
    emailThread: { findMany: jest.fn() },
    queryLog: { create: jest.fn() },
  },
}))
jest.mock('@/lib/openai', () => ({
  generateEmbedding: jest.fn(),
  openai: { chat: { completions: { create: jest.fn() } } },
}))
jest.mock('@/lib/pinecone', () => ({ searchSimilar: jest.fn(), searchInNamespace: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockWorkspaceFind = jest.mocked(prisma.workspace.findUnique)
const mockChunkFindMany = jest.mocked(prisma.notionChunk.findMany)
const mockKnowledgeFindMany = jest.mocked(prisma.knowledgeItem.findMany)
const mockQueryLogCreate = jest.mocked(prisma.queryLog.create)
const mockEmbed = jest.mocked(generateEmbedding)
const mockSearch = jest.mocked(searchSimilar)
const mockPersonalSearch = jest.mocked(searchInNamespace)
const mockChat = jest.mocked(openai.chat.completions.create)
const mockTrackEvent = jest.mocked(trackEvent)
const mockEmailThreadFindMany = jest.mocked(prisma.emailThread.findMany)

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
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  page: { id: 'page-1', title: 'Policy Doc', notionPageId: 'notion-abc', lastEditedAt: new Date('2026-06-01T00:00:00.000Z') },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: WORKSPACE_ID } } as never)
  mockMemberFind.mockResolvedValue({ role: 'member', status: 'active', displayName: DISPLAY_NAME, department: 'Engineering' } as never)
  mockWorkspaceFind.mockResolvedValue({ id: WORKSPACE_ID, name: WORKSPACE_NAME, type: 'team' } as never)
  mockEmbed.mockResolvedValue(mockEmbedding)
  mockSearch.mockResolvedValue([{ id: 'pin-1', score: 0.88 }])
  mockPersonalSearch.mockResolvedValue([])
  mockChunkFindMany.mockResolvedValue([mockChunk] as never)
  mockKnowledgeFindMany.mockResolvedValue([] as never)
  mockEmailThreadFindMany.mockResolvedValue([] as never)
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

  it('searches both team and personal namespaces', async () => {
    await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(mockSearch).toHaveBeenCalledWith(mockEmbedding, WORKSPACE_ID, 10, 0.3)
    expect(mockPersonalSearch).toHaveBeenCalledWith(mockEmbedding, `${WORKSPACE_ID}:${CLERK_ID}`, 25, 0.3)
  })

  it('calls both search functions once', async () => {
    await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(mockSearch).toHaveBeenCalledTimes(1)
    expect(mockPersonalSearch).toHaveBeenCalledTimes(1)
    expect(mockPersonalSearch).toHaveBeenCalledWith(expect.any(Array), `${WORKSPACE_ID}:${CLERK_ID}`, 25, 0.3)
  })

  it('fetches NotionChunks by pineconeId from both namespaces', async () => {
    await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(mockChunkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pineconeId: { in: expect.any(Array) } }),
      }),
    )
  })

  it('includes Gmail personal sources from the authenticated user namespace', async () => {
    mockSearch.mockResolvedValue([])
    mockPersonalSearch.mockResolvedValue([{ id: 'gmail-pin-1', score: 0.92 }])
    mockChunkFindMany.mockResolvedValue([] as never)
    mockKnowledgeFindMany.mockResolvedValue([
      {
        id: 'gmail-pin-1',
        content: 'The refund policy says customers can get a refund within 30 days.',
        source: 'gmail',
        sourceUrl: 'https://mail.google.com/mail/#inbox/thread-1',
        sourceExternalId: 'thread-1',
        category: 'fact',
        label: null,
        owner: 'finance@company.com',
        notionPageTitle: null,
        sourceCreatedAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-02T00:00:00.000Z'),
        visibility: 'personal',
        visibilitySetBy: CLERK_ID,
      },
    ] as never)
    mockEmailThreadFindMany.mockResolvedValue([
      {
        gmailThreadId: 'thread-1',
        subject: 'Refund policy',
        labelNames: ['Inbox'],
        lastMessageAt: new Date('2026-06-01T00:00:00.000Z'),
        chunks: [{ metadata: { from: 'finance@company.com', url: 'https://mail.google.com/mail/#inbox/thread-1' } }],
      },
    ] as never)

    const events = await readSSE(await POST(makeRequest({ question: 'Find the email about refund policy.' })))
    const sourcesEvent = events.find((event) => event.type === 'sources')
    expect((sourcesEvent?.sources as Array<{ source: string }> | undefined)?.some((source) => source.source === 'gmail')).toBe(true)
    expect(mockKnowledgeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { visibility: 'team' },
            { visibility: 'personal', visibilitySetBy: CLERK_ID },
          ]),
        }),
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
    expect(done!.topSources).toBeDefined()
    expect(done!.remainingSources).toBeDefined()
    expect(done!.totalSources).toBe(1)
    expect(typeof done!.confidence).toBe('number')
  })

  it('returns the top three ranked distinct sources in the streamed payload', async () => {
    mockSearch.mockResolvedValue([
      { id: 'linear-duplicate', score: 0.99 },
      { id: 'linear-1', score: 0.98 },
      { id: 'linear-2', score: 0.97 },
      { id: 'linear-3', score: 0.96 },
      { id: 'linear-4', score: 0.95 },
    ])
    mockChunkFindMany.mockResolvedValue([] as never)
    const knowledge = [
      ['linear-duplicate', 'issue-1', 'decision'],
      ['linear-1', 'issue-1', 'fact'],
      ['linear-2', 'issue-2', 'status_update'],
      ['linear-3', 'issue-3', 'fact'],
      ['linear-4', 'issue-4', 'fact'],
    ].map(([id, sourceExternalId, category]) => ({
      id,
      content: `Linear issue ${sourceExternalId}: Work item.`,
      source: 'linear',
      sourceUrl: `https://linear.app/${sourceExternalId}`,
      sourceExternalId,
      category,
      label: null,
      owner: null,
      notionPageTitle: null,
      sourceCreatedAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    }))
    mockKnowledgeFindMany.mockResolvedValue(knowledge as never)

    const events = await readSSE(await POST(makeRequest({ question: 'What is active?' })))
    const sourcesEvent = events.find((event) => event.type === 'sources')
    expect(sourcesEvent?.topSources).toHaveLength(3)
    expect(sourcesEvent?.remainingSources).toHaveLength(1)
    expect(sourcesEvent?.totalSources).toBe(4)
    expect((sourcesEvent?.sources as Array<{ sourceExternalId: string }>).map((source) => source.sourceExternalId)).toEqual([
      'issue-1',
      'issue-2',
      'issue-3',
      'issue-4',
    ])
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
