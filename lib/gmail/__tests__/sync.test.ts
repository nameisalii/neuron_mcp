/** @jest-environment node */
import { syncGmail, MAX_MESSAGES_PER_SYNC, MESSAGE_BATCH_SIZE } from '../sync'
import { sleep, buildSearchQuery } from '../api'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbeddingInNamespace, deleteEmbeddingsInNamespace } from '@/lib/pinecone'
import { prisma } from '@/lib/db'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'
import { trackEvent } from '@/lib/activity'
import type { GmailSyncMetadata } from '@/types'

jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({
  upsertEmbedding: jest.fn(),
  upsertEmbeddingInNamespace: jest.fn(),
  deleteEmbeddingsInNamespace: jest.fn(),
}))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledgeDetailed: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn().mockReturnValue('raw_refresh_token') }))
jest.mock('../api', () => {
  const actual = jest.requireActual('../api')
  return { ...actual, sleep: jest.fn().mockResolvedValue(undefined) }
})
jest.mock('@/lib/db', () => ({
  prisma: {
    emailThread: { upsert: jest.fn() },
    emailChunk: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    knowledgeItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    integration: { update: jest.fn() },
  },
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeAll(() => {
  process.env.GMAIL_CLIENT_ID = 'test_client_id'
  process.env.GMAIL_CLIENT_SECRET = 'test_client_secret'
})

const WORKSPACE_ID = 'ws_1'
const SYNCED_BY = 'user_1'
const PERSONAL_NAMESPACE = `${WORKSPACE_ID}:${SYNCED_BY}`

const BASE_METADATA: GmailSyncMetadata = {
  selectedLabels: ['INBOX'],
  selectedLabelNames: ['Inbox'],
  timeWindow: 60,
  senderFilter: [],
}

interface FixtureMessage {
  id: string
  threadId: string
  subject?: string
  from?: string
  to?: string
  dateMs?: number
  body?: string
  labelIds?: string[]
}

function b64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

function fullMessage(msg: FixtureMessage) {
  const dateMs = msg.dateMs ?? Date.parse('2026-06-01T10:00:00Z')
  return {
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds ?? ['INBOX'],
    internalDate: String(dateMs),
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'Subject', value: msg.subject ?? 'Re: refund' },
        { name: 'From', value: msg.from ?? 'John <john@client.com>' },
        { name: 'To', value: msg.to ?? 'ali@neuron.app' },
        { name: 'Date', value: new Date(dateMs).toUTCString() },
      ],
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: msg.body === '' ? undefined : b64url(msg.body ?? 'The refund was approved on Friday.') },
        },
      ],
    },
  }
}

// Routes mocked fetch calls by URL: token refresh, messages.list, messages.get.
function setupGmailApi(messages: FixtureMessage[], opts?: { endlessPages?: boolean }) {
  const byId = new Map(messages.map((m) => [m.id, m]))
  mockFetch.mockImplementation(async (input: string | URL) => {
    const url = String(input)
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ access_token: 'fresh_access_token', expires_in: 3599 }) }
    }
    const getMatch = url.match(/\/messages\/([^/?]+)\?format=full/)
    if (getMatch) {
      const msg = byId.get(decodeURIComponent(getMatch[1]))
      if (!msg) return { ok: false, status: 404, json: async () => ({}) }
      return { ok: true, json: async () => fullMessage(msg) }
    }
    if (url.includes('/messages?')) {
      const params = new URL(url).searchParams
      const max = Number(params.get('maxResults') ?? 100)
      const requestedLabelIds = params.getAll('labelIds').map((value) => value.trim()).filter(Boolean)
      const filteredMessages = messages.filter((message) => {
        if (requestedLabelIds.length === 0) return true
        const messageLabels = message.labelIds ?? ['INBOX']
        return requestedLabelIds.some((labelId) => messageLabels.includes(labelId))
      })
      if (opts?.endlessPages) {
        const offset = Number(params.get('pageToken') ?? 0)
        const page = Array.from({ length: max }, (_, i) => {
          const id = `bulk_${offset + i}`
          if (!byId.has(id)) byId.set(id, { id, threadId: `thread_${offset + i}` })
          return { id, threadId: `thread_${offset + i}` }
        })
        return {
          ok: true,
          json: async () => ({ messages: page, nextPageToken: String(offset + max) }),
        }
      }
      return {
        ok: true,
        json: async () => ({ messages: filteredMessages.slice(0, max).map(({ id, threadId }) => ({ id, threadId })) }),
      }
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

function listUrls(): string[] {
  return mockFetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/messages?'))
}

function chunkCreates(): Array<{ data: Record<string, unknown> }> {
  return (prisma.emailChunk.create as jest.Mock).mock.calls.map((c) => c[0])
}

function baseInput(overrides?: Partial<Parameters<typeof syncGmail>[0]>) {
  return {
    workspaceId: WORKSPACE_ID,
    accessToken: 'encrypted_refresh_token',
    syncedBy: SYNCED_BY,
    syncedByName: 'Ali',
    metadata: BASE_METADATA,
    lastSyncAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(generateEmbedding as jest.Mock).mockResolvedValue(new Array(1536).fill(0))
  ;(upsertEmbeddingInNamespace as jest.Mock).mockResolvedValue(undefined)
  ;(deleteEmbeddingsInNamespace as jest.Mock).mockResolvedValue(undefined)
  ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({
    items: [],
    diagnostics: {
      extractorCalled: 1,
      extractorReturnedEmpty: 1,
      extractorParseFailed: 0,
      validationFailed: 0,
      fallbackItemsCreated: 0,
      knowledgeItemCreateFailed: 0,
      embeddingUpsertFailed: 0,
      itemProcessingFailed: 0,
    },
  })
  ;(trackEvent as jest.Mock).mockResolvedValue(undefined)
  ;(prisma.emailThread.upsert as jest.Mock).mockImplementation(async (args) => ({
    id: `db_${args.where.workspaceId_gmailThreadId.gmailThreadId}`,
  }))
  ;(prisma.emailChunk.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.emailChunk.deleteMany as jest.Mock).mockResolvedValue({ count: 0 })
  ;(prisma.emailChunk.create as jest.Mock).mockResolvedValue({ id: 'chunk_1' })
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-memory' })
  ;(prisma.knowledgeItem.create as jest.Mock).mockResolvedValue({ id: 'memory-1' })
  ;(prisma.knowledgeItem.update as jest.Mock).mockResolvedValue({})
  ;(prisma.knowledgeItem.delete as jest.Mock).mockResolvedValue({})
  ;(prisma.integration.update as jest.Mock).mockResolvedValue({})
})

describe('syncGmail query building', () => {
  it('only fetches emails matching selected labels, time window, and sender filter', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-11T00:00:00Z'))
    setupGmailApi([
      { id: 'msg_1', threadId: 'thread_a', labelIds: ['INBOX'] },
      { id: 'msg_2', threadId: 'thread_b', labelIds: ['Label_42'] },
    ])

    await syncGmail(baseInput({
      metadata: {
        ...BASE_METADATA,
        selectedLabels: ['INBOX', 'Label_42'],
        timeWindow: 30,
        senderFilter: ['john@client.com', '@partner.co'],
        excludeFilter: ['spam@noise.com'],
      },
    }))
    jest.useRealTimers()

    const urls = listUrls()
    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain('labelIds=INBOX')
    expect(urls[1]).toContain('labelIds=Label_42')
    for (const url of urls) {
      const q = new URL(url).searchParams.get('q') ?? ''
      expect(q).toContain('after:2026/05/12')
      expect(q).toContain('from:(john@client.com OR @partner.co)')
      expect(q).toContain('-from:(spam@noise.com)')
      expect(new URL(url).searchParams.get('includeSpamTrash')).toBe('false')
    }
  })

  it('uses canonical Gmail label IDs even when metadata has user-friendly names', async () => {
    setupGmailApi([
      { id: 'msg_1', threadId: 'thread_a', labelIds: ['INBOX'] },
    ])

    await syncGmail(baseInput({
      metadata: {
        ...BASE_METADATA,
        selectedLabels: ['Inbox'],
        selectedLabelNames: ['Inbox'],
      },
    }))

    const url = listUrls()[0]
    expect(url).toContain('labelIds=INBOX')
  })

  it('throws when no labels are configured instead of syncing everything', async () => {
    setupGmailApi([])
    await expect(
      syncGmail(baseInput({ metadata: { ...BASE_METADATA, selectedLabels: [] } })),
    ).rejects.toThrow(/configure/i)
    expect(listUrls()).toHaveLength(0)
  })

  it('does not use lastSyncAt from an empty attempt as the import cursor', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-11T00:00:00Z'))
    setupGmailApi([])

    const result = await syncGmail(baseInput({
      lastSyncAt: new Date('2026-06-08T12:00:00Z'),
      metadata: { ...BASE_METADATA, syncFrom: '2026-04-01T00:00:00.000Z' },
    }))
    jest.useRealTimers()

    const q = new URL(listUrls()[0]).searchParams.get('q') ?? ''
    expect(q).toContain('after:2026/04/01')
    expect(result.lastSuccessfulImportAt).toBeNull()
  })

  it('uses lastSuccessfulImportAt for incremental sync after a real import', async () => {
    setupGmailApi([])

    await syncGmail(baseInput({
      lastSyncAt: new Date('2026-06-10T00:00:00Z'),
      metadata: {
        ...BASE_METADATA,
        syncFrom: '2026-04-01T00:00:00.000Z',
        lastSyncAttemptAt: '2026-06-10T00:00:00.000Z',
        lastSuccessfulImportAt: '2026-06-08T12:00:00.000Z',
      },
    }))

    const q = new URL(listUrls()[0]).searchParams.get('q') ?? ''
    expect(q).toContain('after:2026/06/08')
  })

  it('uses configured syncFrom when provided', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-11T00:00:00Z'))
    setupGmailApi([])

    await syncGmail(baseInput({ metadata: { ...BASE_METADATA, syncFrom: '2026-06-02T00:00:00.000Z' } }))
    jest.useRealTimers()

    const q = new URL(listUrls()[0]).searchParams.get('q') ?? ''
    expect(q).toContain('after:2026/06/02')
  })

  it('builds a safe query when sender and exclude filters are empty', async () => {
    expect(buildSearchQuery(new Date('2026-06-02T00:00:00.000Z'), [], [])).toBe('after:2026/06/02')
  })
})

describe('syncGmail thread grouping and chunks', () => {
  it('groups messages by thread with chronologically ordered chunk positions', async () => {
    setupGmailApi([
      { id: 'msg_2', threadId: 'thread_a', dateMs: Date.parse('2026-06-02T10:00:00Z'), body: 'Second message' },
      { id: 'msg_1', threadId: 'thread_a', dateMs: Date.parse('2026-06-01T10:00:00Z'), subject: 'Refund request', body: 'First message' },
    ])

    const result = await syncGmail(baseInput())

    expect(result).toMatchObject({ success: true, threadsProcessed: 1, messagesProcessed: 2 })
    expect(prisma.emailThread.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.emailThread.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_gmailThreadId: { workspaceId: WORKSPACE_ID, gmailThreadId: 'thread_a' } },
      create: expect.objectContaining({ subject: 'Refund request', syncedBy: SYNCED_BY }),
    }))

    const creates = chunkCreates()
    expect(creates).toHaveLength(2)
    expect(creates[0].data).toMatchObject({ position: 0, content: expect.stringContaining('First message') })
    expect(creates[1].data).toMatchObject({ position: 1, content: expect.stringContaining('Second message') })
    expect((creates[0].data.metadata as Record<string, unknown>).threadPosition).toBe(0)
    expect((creates[1].data.metadata as Record<string, unknown>).threadPosition).toBe(1)
  })

  it('writes complete chunk metadata including the Gmail deep link', async () => {
    setupGmailApi([{
      id: 'msg_1',
      threadId: 'thread_a',
      subject: 'Refund request',
      from: 'John <john@client.com>',
      to: 'ali@neuron.app, sam@neuron.app',
      dateMs: Date.parse('2026-06-01T10:00:00Z'),
    }])

    await syncGmail(baseInput())

    const { data } = chunkCreates()[0]
    expect(data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      blockType: 'email_message',
      pineconeId: expect.stringContaining('gmail'),
    })
    expect(data.metadata).toMatchObject({
      threadId: 'thread_a',
      messageId: 'msg_1',
      subject: 'Refund request',
      from: 'John <john@client.com>',
      to: ['ali@neuron.app', 'sam@neuron.app'],
      date: '2026-06-01T10:00:00.000Z',
      sourceCreatedAt: '2026-06-01T10:00:00.000Z',
      isThread: true,
      threadPosition: 0,
      url: 'https://mail.google.com/mail/#inbox/thread_a',
      labelNames: ['Inbox'],
    })
  })

  it('defaults every chunk to personal visibility with visibilitySetBy recorded', async () => {
    setupGmailApi([
      { id: 'msg_1', threadId: 'thread_a' },
      { id: 'msg_2', threadId: 'thread_b' },
    ])

    await syncGmail(baseInput())

    const creates = chunkCreates()
    expect(creates).toHaveLength(2)
    for (const { data } of creates) {
      expect(data.visibility).toBe('personal')
      expect(data.visibilitySetBy).toBe(SYNCED_BY)
    }
  })

  it('escapes XML in email content before storage and embedding', async () => {
    setupGmailApi([{ id: 'msg_1', threadId: 'thread_a', body: 'Discount <20%> & free shipping' }])

    await syncGmail(baseInput())

    const stored = chunkCreates()[0].data.content as string
    expect(stored).toContain('&lt;20%&gt; &amp; free shipping')
    expect(stored).not.toContain('<20%>')
    expect(generateEmbedding).toHaveBeenCalledWith(expect.stringContaining('&lt;20%&gt;'))
  })

  it('stores full long emails while bounding embedding input', async () => {
    const longBody = 'Long email content. '.repeat(1000)
    setupGmailApi([{ id: 'msg_1', threadId: 'thread_a', body: longBody }])

    await syncGmail(baseInput())

    expect(chunkCreates()[0].data.content).toBe(longBody.trim())
    const embeddingInput = (generateEmbedding as jest.Mock).mock.calls[0][0] as string
    expect(embeddingInput.length).toBeLessThan(longBody.length)
    expect(embeddingInput).toContain('[Email content truncated for processing]')
  })

  it('upserts embeddings only to the personal Pinecone namespace', async () => {
    setupGmailApi([{ id: 'msg_1', threadId: 'thread_a' }])

    await syncGmail(baseInput())

    expect(upsertEmbeddingInNamespace).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ workspaceId: WORKSPACE_ID, source: 'gmail' }),
      PERSONAL_NAMESPACE,
    )
  })

  it('skips messages with empty bodies and threads with no usable messages', async () => {
    setupGmailApi([{ id: 'msg_1', threadId: 'thread_a', body: '' }])

    const result = await syncGmail(baseInput())

    expect(result).toMatchObject({ threadsProcessed: 0, messagesProcessed: 0, skipped: 1 })
    expect(prisma.emailThread.upsert).not.toHaveBeenCalled()
    expect(prisma.emailChunk.create).not.toHaveBeenCalled()
  })

  it('runs the extraction pipeline with personal privacy options', async () => {
    setupGmailApi([{ id: 'msg_1', threadId: 'thread_a' }])

    await syncGmail(baseInput())

    expect(extractKnowledgeDetailed).toHaveBeenCalledWith(
      expect.any(Array),
      WORKSPACE_ID,
      'gmail',
      'https://mail.google.com/mail/#inbox/thread_a',
      'thread_a',
      undefined,
      { namespace: PERSONAL_NAMESPACE, visibility: 'personal', visibilitySetBy: SYNCED_BY },
    )
  })

  it('imports a thread and chunk even when extraction returns nothing', async () => {
    setupGmailApi([{ id: 'msg_1', threadId: 'thread_a' }])

    const result = await syncGmail(baseInput())

    expect(result.importedThreads).toBe(1)
    expect(result.importedChunks).toBe(1)
    expect(result.extractedKnowledgeItems).toBe(0)
    expect(prisma.emailThread.upsert).toHaveBeenCalled()
    expect(prisma.emailChunk.create).toHaveBeenCalled()
  })

  it('creates a personal fallback reference when AI extraction returns empty for a useful email', async () => {
    ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue(null)
    setupGmailApi([{
      id: 'msg_1',
      threadId: 'thread_a',
      subject: 'Refund policy follow-up',
      from: 'John <john@client.com>',
      body: 'Can you send the refund policy by Friday? Customers can get a full refund within 30 days.',
    }])

    const result = await syncGmail(baseInput())

    expect(result).toMatchObject({
      aiExtractedKnowledgeItems: 0,
      fallbackKnowledgeItems: 1,
      extractedKnowledgeItems: 1,
      chunksEmbedded: 1,
    })
    expect(prisma.knowledgeItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        category: 'reference',
        source: 'gmail',
        sourceExternalId: 'thread_a',
        visibility: 'personal',
        visibilitySetBy: SYNCED_BY,
      }),
    }))
    expect(upsertEmbeddingInNamespace).toHaveBeenCalledWith(
      'memory-1',
      expect.any(Array),
      expect.objectContaining({ source: 'gmail' }),
      PERSONAL_NAMESPACE,
    )
  })

  it('does not create fallback memory for promotional no-reply email', async () => {
    ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue(null)
    setupGmailApi([{
      id: 'msg_1',
      threadId: 'thread_a',
      subject: 'Limited time sale',
      from: 'no-reply@store.example',
      body: 'Shop now and save 50 percent. Unsubscribe from marketing preferences.',
    }])

    const result = await syncGmail(baseInput())

    expect(result.fallbackKnowledgeItems).toBe(0)
    expect(result.extractionDiagnostics.skippedPromotional).toBeGreaterThan(0)
    expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
  })

  it('does not create fallback memory for security code email', async () => {
    ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue(null)
    setupGmailApi([{
      id: 'msg_1',
      threadId: 'thread_a',
      subject: 'Secure two-step verification notification',
      from: 'MyAccount@example.gov',
      body: 'You requested a secure verification code to log into your account. This code expires soon.',
    }])

    const result = await syncGmail(baseInput())

    expect(result.fallbackKnowledgeItems).toBe(0)
    expect(result.extractionDiagnostics.skippedPromotional).toBeGreaterThan(0)
  })

  it('separates AI extraction from fallback counters', async () => {
    ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({
      items: [{ content: 'Product Hunt launch is delayed', category: 'decision', owner: null, confidence: 0.9 }],
      diagnostics: {
        extractorCalled: 1,
        extractorReturnedEmpty: 0,
        extractorParseFailed: 0,
        validationFailed: 0,
        fallbackItemsCreated: 0,
        knowledgeItemCreateFailed: 0,
        embeddingUpsertFailed: 0,
        itemProcessingFailed: 0,
      },
    })
    setupGmailApi([{ id: 'msg_1', threadId: 'thread_a', body: 'We decided to delay Product Hunt launch until integrations are stable.' }])

    const result = await syncGmail(baseInput())

    expect(result.aiExtractedKnowledgeItems).toBe(1)
    expect(result.fallbackKnowledgeItems).toBe(0)
    expect(result.extractedKnowledgeItems).toBe(1)
  })

  it('creates fallback memory after extractor parse failure without breaking chunk sync', async () => {
    ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue(null)
    ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({
      items: [],
      diagnostics: {
        extractorCalled: 1,
        extractorReturnedEmpty: 0,
        extractorParseFailed: 1,
        validationFailed: 0,
        fallbackItemsCreated: 0,
        knowledgeItemCreateFailed: 0,
        embeddingUpsertFailed: 0,
        itemProcessingFailed: 0,
      },
    })
    setupGmailApi([{
      id: 'msg_1',
      threadId: 'thread_a',
      subject: 'NVIDIA onboarding',
      body: 'Reminder: apply for the NVIDIA onboarding form before June 20. Please confirm when complete.',
    }])

    const result = await syncGmail(baseInput())

    expect(result.importedChunks).toBe(1)
    expect(result.fallbackKnowledgeItems).toBe(1)
    expect(result.extractionDiagnostics.extractorParseFailed).toBe(1)
  })

  it('deduplicates the same Gmail message across multiple selected labels', async () => {
    setupGmailApi([
      { id: 'msg_1', threadId: 'thread_a', labelIds: ['INBOX', 'STARRED'] },
    ])

    const result = await syncGmail(baseInput({ metadata: { ...BASE_METADATA, selectedLabels: ['INBOX', 'STARRED'], selectedLabelNames: ['Inbox', 'Starred'] } }))

    expect(result.messagesFoundBeforeFiltering).toBe(2)
    expect(result.importedThreads).toBe(1)
    expect(result.importedChunks).toBe(1)
    expect(prisma.emailChunk.create).toHaveBeenCalledTimes(1)
  })
})

describe('syncGmail limits and attribution', () => {
  it('caps the sync at MAX_MESSAGES_PER_SYNC and reports it', async () => {
    setupGmailApi([], { endlessPages: true })

    const result = await syncGmail(baseInput())

    expect(result.messagesProcessed).toBe(MAX_MESSAGES_PER_SYNC)
    expect(result.capped).toBe(true)
    expect(result.message).toMatch(/more emails match/i)
  }, 30_000)

  it('sleeps between message batches to respect Gmail rate limits', async () => {
    const messages = Array.from({ length: MESSAGE_BATCH_SIZE + 1 }, (_, i) => ({
      id: `msg_${i}`,
      threadId: `thread_${i}`,
    }))
    setupGmailApi(messages)

    await syncGmail(baseInput())

    expect(sleep).toHaveBeenCalled()
  })

  it('records attribution, attempt time, and successful import cursor', async () => {
    setupGmailApi([
      { id: 'msg_1', threadId: 'thread_a' },
      { id: 'msg_2', threadId: 'thread_b' },
    ])

    await syncGmail(baseInput())

    expect(trackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      SYNCED_BY,
      'Ali',
      'sync',
      expect.stringContaining('synced 2 email threads from Gmail'),
      expect.any(Object),
    )
    expect(prisma.integration.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_type: { workspaceId: WORKSPACE_ID, type: 'gmail' } },
      data: expect.objectContaining({
        lastSyncAt: expect.any(Date),
        metadata: expect.objectContaining({
          lastSyncAttemptAt: expect.any(String),
          lastSuccessfulImportAt: expect.any(String),
        }),
      }),
    }))
  })

  it('returns mailbox diagnostics and a helpful warning when narrow labels match nothing', async () => {
    setupGmailApi([
      { id: 'msg_1', threadId: 'thread_a', labelIds: ['INBOX'] },
      { id: 'msg_2', threadId: 'thread_b', labelIds: ['SENT'] },
    ])

    const result = await syncGmail(baseInput({
      metadata: {
        ...BASE_METADATA,
        selectedLabels: ['IMPORTANT', 'STARRED'],
        selectedLabelNames: ['Important', 'Starred'],
        syncFrom: '2026-04-01T00:00:00.000Z',
      },
      lastSyncAt: new Date('2026-06-12T00:00:00.000Z'),
    }))

    expect(result.importedThreads).toBe(0)
    expect(result.messagesFoundBeforeFiltering).toBe(0)
    expect(result.canReadMailbox).toBe(true)
    expect(result.recentMessagesAvailable).toBeGreaterThanOrEqual(1)
    expect(result.inboxMessagesAvailable).toBe(1)
    expect(result.sentMessagesAvailable).toBe(1)
    expect(result.diagnosticInboxCount).toBe(1)
    expect(result.diagnosticSentCount).toBe(1)
    expect(result.gmailQueryUsed).toContain('after:2026/04/01')
    expect(result.message).toMatch(/No emails matched IMPORTANT or STARRED.*Add Inbox or Sent/i)
    expect(result.lastSuccessfulImportAt).toBeNull()
    expect(prisma.integration.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.not.objectContaining({ lastSuccessfulImportAt: expect.anything() }),
      }),
    }))
  })

  it('imports messages after reconfiguring from narrow labels to Inbox and Sent', async () => {
    setupGmailApi([
      { id: 'msg_1', threadId: 'thread_a', labelIds: ['INBOX'] },
      { id: 'msg_2', threadId: 'thread_b', labelIds: ['SENT'] },
    ])

    const result = await syncGmail(baseInput({
      metadata: {
        ...BASE_METADATA,
        selectedLabels: ['INBOX', 'SENT'],
        selectedLabelNames: ['Inbox', 'Sent'],
        syncFrom: '2026-04-01T00:00:00.000Z',
      },
      lastSyncAt: new Date('2026-06-12T00:00:00.000Z'),
    }))

    expect(result.gmailQueryUsed).toContain('after:2026/04/01')
    expect(result.importedThreads).toBe(2)
    expect(result.importedChunks).toBe(2)
    expect(result.lastSuccessfulImportAt).toEqual(expect.any(String))
  })

  it('replaces stale chunks and removes their personal-namespace vectors on re-sync', async () => {
    ;(prisma.emailChunk.findMany as jest.Mock).mockResolvedValue([
      { pineconeId: 'old_vec_1' },
      { pineconeId: null },
    ])
    setupGmailApi([{ id: 'msg_1', threadId: 'thread_a' }])

    await syncGmail(baseInput())

    expect(deleteEmbeddingsInNamespace).toHaveBeenCalledWith(['old_vec_1'], PERSONAL_NAMESPACE)
    expect(prisma.emailChunk.deleteMany).toHaveBeenCalled()
  })
})
