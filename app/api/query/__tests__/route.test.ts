/**
 * @jest-environment node
 */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { generateEmbedding, openai } from '@/lib/openai'
import { searchSimilar, searchInNamespace } from '@/lib/pinecone'
import { trackValidationEvent } from '@/lib/activity'
import { createOrAppendConversation, loadRecentConversationMessages, storeAssistantMessage } from '@/lib/chat/persistence'
import { searchDocumentAttachments } from '@/lib/documents/search'
import { validateApiKey } from '@/lib/api-auth'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    workspace: { findUnique: jest.fn() },
    notionChunk: { findMany: jest.fn() },
    knowledgeItem: { findMany: jest.fn() },
    emailChunk: { findMany: jest.fn() },
    emailThread: { findMany: jest.fn() },
    queryLog: { create: jest.fn() },
    activityEvent: { count: jest.fn(), findFirst: jest.fn() },
    task: { findMany: jest.fn() },
    decision: { findMany: jest.fn() },
  },
}))
jest.mock('@/lib/openai', () => ({
  generateEmbedding: jest.fn(),
  openai: { chat: { completions: { create: jest.fn() } } },
}))
jest.mock('@/lib/pinecone', () => ({ searchSimilar: jest.fn(), searchInNamespace: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackValidationEvent: jest.fn() }))
jest.mock('@/lib/chat/persistence', () => ({
  createOrAppendConversation: jest.fn(),
  loadRecentConversationMessages: jest.fn(),
  storeAssistantMessage: jest.fn(),
}))
jest.mock('@/lib/documents/search', () => ({ searchDocumentAttachments: jest.fn() }))
jest.mock('@/lib/api-auth', () => ({ validateApiKey: jest.fn() }))

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
const mockTrackEvent = jest.mocked(trackValidationEvent)
const mockEmailThreadFindMany = jest.mocked(prisma.emailThread.findMany)
const mockEmailChunkFindMany = jest.mocked(prisma.emailChunk.findMany)
const mockCreateOrAppendConversation = jest.mocked(createOrAppendConversation)
const mockLoadRecentConversationMessages = jest.mocked(loadRecentConversationMessages)
const mockStoreAssistantMessage = jest.mocked(storeAssistantMessage)
const mockSearchDocumentAttachments = jest.mocked(searchDocumentAttachments)
const mockValidateApiKey = jest.mocked(validateApiKey)

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
  mockValidateApiKey.mockReturnValue(null)
  mockUserFind.mockResolvedValue({ workspace: { id: WORKSPACE_ID } } as never)
  mockMemberFind.mockResolvedValue({ role: 'member', status: 'active', displayName: DISPLAY_NAME, department: 'Engineering' } as never)
  mockWorkspaceFind.mockResolvedValue({ id: WORKSPACE_ID, name: WORKSPACE_NAME, type: 'team' } as never)
  mockEmbed.mockResolvedValue(mockEmbedding)
  mockSearch.mockResolvedValue([{ id: 'pin-1', score: 0.88 }])
  mockPersonalSearch.mockResolvedValue([])
  mockChunkFindMany.mockResolvedValue([mockChunk] as never)
  mockKnowledgeFindMany.mockResolvedValue([] as never)
  mockEmailThreadFindMany.mockResolvedValue([] as never)
  mockEmailChunkFindMany.mockResolvedValue([] as never)
  mockQueryLogCreate.mockResolvedValue({ id: 'log-1' } as never)
  mockTrackEvent.mockResolvedValue({ ok: true, eventId: 'event-1' })
  jest.mocked(prisma.activityEvent.count).mockResolvedValue(1)
  jest.mocked(prisma.activityEvent.findFirst).mockResolvedValue({ id: 'existing-completion' } as never)
  mockCreateOrAppendConversation.mockResolvedValue({ conversationId: 'conversation-1', relatedLoadId: null })
  mockLoadRecentConversationMessages.mockResolvedValue([])
  jest.mocked(prisma.task.findMany).mockResolvedValue([])
  jest.mocked(prisma.decision.findMany).mockResolvedValue([])
  mockStoreAssistantMessage.mockResolvedValue(undefined)
  mockSearchDocumentAttachments.mockResolvedValue([])
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

  it('accepts a valid API key and queries as the workspace owner', async () => {
    mockValidateApiKey.mockReturnValue(WORKSPACE_ID)
    mockAuth.mockResolvedValue({ userId: null } as never)
    mockWorkspaceFind
      .mockResolvedValueOnce({ owner: { clerkId: CLERK_ID } } as never)
      .mockResolvedValueOnce({ name: WORKSPACE_NAME } as never)

    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))

    expect(res.status).toBe(200)
    expect(mockMemberFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: CLERK_ID } },
    }))
  })

  it('returns 400 when question is fewer than 3 characters', async () => {
    const res = await POST(makeRequest({ question: 'hi' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 with a clear error when question is blank', async () => {
    const res = await POST(makeRequest({ question: '   ' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Question must be 3–500 characters' })
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

  it('returns conversationId in sources and done SSE events', async () => {
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    const events = await readSSE(res)
    expect(events.find((e) => e.type === 'sources')?.conversationId).toBe('conversation-1')
    expect(events.find((e) => e.type === 'done')?.conversationId).toBe('conversation-1')
  })

  it('stores chat conversation and assistant message for a query', async () => {
    await readSSE(await POST(makeRequest({ question: 'What is the refund policy?' })))
    expect(mockCreateOrAppendConversation).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID,
      userId: CLERK_ID,
      question: 'What is the refund policy?',
    }))
    expect(mockStoreAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID,
      userId: CLERK_ID,
      conversationId: 'conversation-1',
      answer: expect.stringContaining('Refunds'),
    }))
  })

  it('passes conversationId when appending to a conversation', async () => {
    await readSSE(await POST(makeRequest({ question: 'What is the refund policy?', conversationId: 'conversation-existing' })))
    expect(mockCreateOrAppendConversation).toHaveBeenCalledWith(expect.objectContaining({
      question: 'What is the refund policy?',
      conversationId: 'conversation-existing',
    }))
  })

  it('still answers when chat persistence fails', async () => {
    mockCreateOrAppendConversation.mockRejectedValue(new Error('chat table missing'))
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(200)
    const events = await readSSE(res)
    expect(events.some((event) => event.type === 'delta')).toBe(true)
    expect(mockStoreAssistantMessage).not.toHaveBeenCalled()
  })

  it('still answers when document search fails', async () => {
    mockSearchDocumentAttachments.mockRejectedValue(new Error('document table missing'))
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(200)
    const events = await readSSE(res)
    expect(events.some((event) => event.type === 'delta')).toBe(true)
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

  it('summarizes recent Telegram updates from retrieved workspace sources', async () => {
    mockSearch.mockResolvedValue([])
    mockPersonalSearch.mockResolvedValue([])
    mockChunkFindMany.mockResolvedValue([] as never)
    mockKnowledgeFindMany.mockResolvedValue([
      {
        id: 'telegram-1',
        content: 'Dispatch team added a Wednesday appointment for load 2543 and asked the team not to book over it.',
        source: 'telegram',
        sourceUrl: null,
        sourceExternalId: 'telegram-msg-1',
        category: 'status_update',
        label: null,
        owner: 'Sam Dispatcher',
        sourceMetadata: { channelName: 'Dispatch updates', authorName: 'Sam Dispatcher' },
        notionPageTitle: null,
        sourceCreatedAt: new Date('2026-07-09T15:00:00.000Z'),
        updatedAt: new Date('2026-07-09T15:01:00.000Z'),
        visibility: 'team',
        visibilitySetBy: null,
      },
      {
        id: 'telegram-2',
        content: 'Load 2543 status changed to in transit and the ETA was moved to 3:30 PM.',
        source: 'telegram',
        sourceUrl: null,
        sourceExternalId: 'telegram-msg-2',
        category: 'status_update',
        label: null,
        owner: 'Alex',
        sourceMetadata: { channelName: 'Dispatch updates', authorName: 'Alex' },
        notionPageTitle: null,
        sourceCreatedAt: new Date('2026-07-09T16:00:00.000Z'),
        updatedAt: new Date('2026-07-09T16:01:00.000Z'),
        visibility: 'team',
        visibilitySetBy: null,
      },
    ] as never)

    const events = await readSSE(await POST(makeRequest({ question: 'give recent updates in telegram' })))
    const answer = String(events.find((event) => event.type === 'done')?.answer ?? '')
    const sources = events.find((event) => event.type === 'sources')?.sources as Array<{ chunkId: string; source: string }> | undefined

    expect(answer).toContain('Recent Telegram updates')
    expect(answer).toContain('Wednesday appointment')
    expect(answer).toContain('Load 2543')
    expect(answer).not.toMatch(/no specific updates|official Telegram channels/i)
    expect(sources?.map((source) => source.chunkId)).toEqual(['telegram-2', 'telegram-1'])
    expect(sources?.every((source) => source.source === 'telegram')).toBe(true)
    expect(mockChat).not.toHaveBeenCalled()
    expect(mockStoreAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      sourceReferences: expect.arrayContaining([
        expect.objectContaining({ chunkId: 'telegram-2' }),
        expect.objectContaining({ chunkId: 'telegram-1' }),
      ]),
    }))
  })

  it.each([
    ['What changed in Slack today?', 'slack', 'Slack'],
    ['Summarize recent Linear updates.', 'linear', 'Linear'],
    ['Latest Gmail updates.', 'gmail', 'Gmail'],
    ['What happened in Datatruck today?', 'datatruck', 'Datatruck'],
  ])('uses source-specific summary mode for %s', async (question, source, displayName) => {
    mockSearch.mockResolvedValue([])
    mockPersonalSearch.mockResolvedValue([])
    mockChunkFindMany.mockResolvedValue([] as never)
    mockKnowledgeFindMany.mockResolvedValue([
      {
        id: `${source}-1`,
        content: `${displayName} update: the operations team changed an important status today.`,
        source,
        sourceUrl: null,
        sourceExternalId: `${source}-external-1`,
        category: 'status_update',
        label: null,
        owner: 'Operator',
        sourceMetadata: source === 'slack' ? { channelName: '#ops' } : {},
        notionPageTitle: null,
        sourceCreatedAt: new Date('2026-07-09T15:00:00.000Z'),
        updatedAt: new Date('2026-07-09T15:01:00.000Z'),
        visibility: 'team',
        visibilitySetBy: null,
      },
    ] as never)

    const events = await readSSE(await POST(makeRequest({ question })))
    const answer = String(events.find((event) => event.type === 'done')?.answer ?? '')
    const sources = events.find((event) => event.type === 'sources')?.sources as Array<{ source: string }> | undefined

    expect(answer).toContain(`Recent ${displayName} updates`)
    expect(answer).toContain('operations team changed')
    expect(sources?.every((item) => item.source === source)).toBe(true)
    expect(mockChat).not.toHaveBeenCalled()
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

  it('creates a safe query ActivityEvent without the private question text', async () => {
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    await res.text() // consume stream so async start() completes
    expect(mockTrackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CLERK_ID,
      DISPLAY_NAME,
      'query',
      'Ali Z queried the company brain',
      expect.objectContaining({ queryLength: 26, hasAnswer: true, hasSources: true, sourceTypes: ['notion'] }),
    )
  })

  it('still returns the answer when onboarding progress tracking fails', async () => {
    jest.mocked(prisma.activityEvent.count).mockRejectedValueOnce(new Error('activity table temporarily unavailable'))
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(200)
    const events = await readSSE(res)
    expect(events.find((event) => event.type === 'done')?.answer).toContain('Refunds over $500')
  })

  it('returns no-information SSE done event when no chunks found', async () => {
    mockSearch.mockResolvedValue([])
    mockPersonalSearch.mockResolvedValue([])
    mockChunkFindMany.mockResolvedValue([] as never)
    mockKnowledgeFindMany.mockResolvedValue([] as never)
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(200)
    const events = await readSSE(res)
    expect(events.find((e) => e.type === 'sources')?.conversationId).toBe('conversation-1')
    const done = events.find((e) => e.type === 'done')
    expect(done!.conversationId).toBe('conversation-1')
    expect(done!.confidence).toBe(0)
    expect(mockStoreAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      answer: "I don't have verified information about this yet.",
    }))
  })

  it('uses conversation context and both HRT aliases for retrieval', async () => {
    mockLoadRecentConversationMessages.mockResolvedValue([
      { role: 'user', content: 'How many interviews do I have?' },
      { role: 'assistant', content: 'I found recruiting activity, but the exact count is uncertain.' },
    ])
    mockSearch.mockResolvedValue([])
    mockPersonalSearch.mockResolvedValue([])
    mockChunkFindMany.mockResolvedValue([] as never)
    mockKnowledgeFindMany.mockResolvedValue([] as never)

    const events = await readSSE(await POST(makeRequest({ question: 'What about HRT?', conversationId: 'conversation-1' })))

    expect(mockEmbed).toHaveBeenCalledWith(expect.stringMatching(/HRT or Hudson River Trading/i))
    expect(mockKnowledgeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { content: { contains: 'HRT', mode: 'insensitive' } },
          { content: { contains: 'Hudson River Trading', mode: 'insensitive' } },
        ]),
      }),
    }))
    expect(events.find((event) => event.type === 'done')?.answer).toMatch(/exact interview count or status/i)
    expect(events.find((event) => event.type === 'sources')).not.toHaveProperty('interpretation')
  })

  it('includes matching Task source cards in interview results', async () => {
    mockLoadRecentConversationMessages.mockResolvedValue([{ role: 'user', content: 'How many interviews do I have?' }])
    mockSearch.mockResolvedValue([])
    mockPersonalSearch.mockResolvedValue([])
    mockChunkFindMany.mockResolvedValue([] as never)
    mockKnowledgeFindMany.mockResolvedValue([] as never)
    jest.mocked(prisma.task.findMany).mockResolvedValue([{
      id: 'task-hrt', workspaceId: WORKSPACE_ID, title: 'Complete HRT OA', description: 'Finish the Hudson River Trading assessment',
      status: 'active', priority: 'high', category: 'work', color: null, dueAt: null, completedAt: null,
      sourceType: 'gmail', sourceId: 'thread-hrt', sourceUrl: 'https://mail.google.com/thread-hrt', sourceTitle: 'HRT assessment',
      sourceSnippet: 'Complete the OA', extractedFromKnowledgeItemId: null, assignedToUserId: CLERK_ID,
      createdByUserId: null, confidence: 0.9, metadata: null, dedupeKey: null,
      createdAt: new Date('2026-08-01T00:00:00Z'), updatedAt: new Date('2026-08-01T00:00:00Z'),
    }] as never)

    const events = await readSSE(await POST(makeRequest({ question: 'What about HRT?', conversationId: 'conversation-1' })))
    const sources = events.find((event) => event.type === 'sources')?.sources as Array<{ source: string }> | undefined
    expect(sources).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'task' })]))
  })

  it('finds Trade Desk interview evidence inside a Gmail body with a generic subject', async () => {
    mockSearch.mockResolvedValue([])
    mockPersonalSearch.mockResolvedValue([])
    mockChunkFindMany.mockResolvedValue([] as never)
    mockKnowledgeFindMany.mockResolvedValue([] as never)
    mockEmailChunkFindMany.mockResolvedValue([{
      id: 'email-chunk-1', emailThreadId: 'thread-db-1', workspaceId: WORKSPACE_ID,
      content: 'The Trade Desk recruiter would like to schedule a technical interview next week.',
      blockType: 'email_message', position: 0, pineconeId: null, labels: [], labeledBy: [],
      visibility: 'personal', visibilitySetBy: CLERK_ID,
      metadata: { messageId: 'gmail-message-1', from: 'Recruiting', date: '2026-08-01T00:00:00Z' },
      createdAt: new Date('2026-08-01T00:00:00Z'), updatedAt: new Date('2026-08-01T00:00:00Z'),
      thread: { id: 'thread-db-1', gmailThreadId: 'gmail-thread-1', subject: 'Following up', labelNames: ['INBOX'], lastMessageAt: new Date('2026-08-01T00:00:00Z') },
    }] as never)

    const events = await readSSE(await POST(makeRequest({ question: 'Do I have an interview with trade desk?' })))
    const done = events.find((event) => event.type === 'done')
    expect(done?.answer).toMatch(/Yes.*interview with The Trade Desk/i)
    expect(done?.sources).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'gmail', content: expect.stringContaining('technical interview') })]))
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('does not infer an interview from a Trade Desk subject alone', async () => {
    mockSearch.mockResolvedValue([])
    mockPersonalSearch.mockResolvedValue([])
    mockChunkFindMany.mockResolvedValue([] as never)
    mockKnowledgeFindMany.mockResolvedValue([] as never)
    mockEmailChunkFindMany.mockResolvedValue([{
      id: 'email-chunk-2', workspaceId: WORKSPACE_ID, content: 'Weekly company newsletter and product announcements.',
      pineconeId: null, visibility: 'personal', metadata: null, updatedAt: new Date('2026-08-01T00:00:00Z'),
      thread: { id: 'thread-db-2', gmailThreadId: 'gmail-thread-2', subject: 'The Trade Desk newsletter', labelNames: ['INBOX'], lastMessageAt: new Date('2026-08-01T00:00:00Z') },
    }] as never)
    const events = await readSSE(await POST(makeRequest({ question: 'Do I have an interview with The Trade Desk?' })))
    expect(events.find((event) => event.type === 'done')?.answer).toMatch(/don’t see evidence inside that content/i)
  })

  it('returns a safe request id on an unexpected upstream error', async () => {
    mockWorkspaceFind.mockRejectedValue(new Error('Database unavailable'))
    const res = await POST(makeRequest({ question: 'What is the refund policy?' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data).toMatchObject({ ok: false, error: 'query_answer_failed', message: expect.stringContaining("couldn't answer") })
    expect(data.requestId).toEqual(expect.any(String))
    expect(mockTrackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CLERK_ID,
      DISPLAY_NAME,
      'query_failed',
      'Company brain query failed',
      expect.objectContaining({ errorCode: 'QUERY_INTERNAL_ERROR', queryLength: 26 }),
    )
  })
})
