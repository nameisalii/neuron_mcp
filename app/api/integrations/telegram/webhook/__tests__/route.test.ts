/** @jest-environment node */
import { POST } from '../route'
import { prisma } from '@/lib/db'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { extractAndCreateSuggestedTaskFromKnowledgeItem } from '@/lib/tasks/service'

jest.mock('@/lib/db', () => ({
  prisma: {
    integration: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    knowledgeItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))
jest.mock('@/lib/extraction/extractor', () => ({
  extractKnowledgeDetailed: jest.fn(),
}))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn() }))
jest.mock('@/lib/tasks/service', () => ({ extractAndCreateSuggestedTaskFromKnowledgeItem: jest.fn() }))

const secret = 'telegram-webhook-secret'
const integration = { id: 'int-1', workspaceId: 'ws-1' }

function textUpdate(overrides: Record<string, unknown> = {}) {
  return {
    update_id: 100,
    message: {
      message_id: 42,
      date: 1_750_000_000,
      text: 'Ship the onboarding redesign on Friday',
      chat: { id: -1001234, type: 'supergroup', username: 'public_team' },
      from: { is_bot: false },
      ...overrides,
    },
  }
}

function request(body: unknown, suppliedSecret = secret) {
  return new Request('http://localhost/api/integrations/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': suppliedSecret,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.TELEGRAM_WEBHOOK_SECRET = secret
  ;(prisma.integration.findMany as jest.Mock).mockResolvedValue([integration])
  ;(prisma.integration.update as jest.Mock).mockResolvedValue(integration)
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue(null)
  ;(prisma.knowledgeItem.create as jest.Mock).mockResolvedValue({ id: 'ki-1' })
  ;(prisma.knowledgeItem.update as jest.Mock).mockResolvedValue({ id: 'ki-1' })
  ;(generateEmbedding as jest.Mock).mockResolvedValue([0.1, 0.2])
  ;(upsertEmbedding as jest.Mock).mockResolvedValue(undefined)
  ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({
    items: [],
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
  ;(extractAndCreateSuggestedTaskFromKnowledgeItem as jest.Mock).mockResolvedValue({ status: 'created', tasks: [{ id: 'task-1' }] })
  jest.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('rejects a wrong secret token', async () => {
  const response = await POST(request(textUpdate(), 'wrong-secret'))
  expect(response.status).toBe(401)
  expect(prisma.integration.findMany).not.toHaveBeenCalled()
})

it('accepts the correct secret token', async () => {
  const response = await POST(request(textUpdate()))
  expect(response.status).toBe(200)
  expect((await response.json()).success).toBe(true)
})

it('creates a Telegram KnowledgeItem from a text message before extraction', async () => {
  await POST(request(textUpdate()))

  expect(prisma.knowledgeItem.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      workspaceId: 'ws-1',
      content: 'Ship the onboarding redesign on Friday',
      category: 'fact',
      source: 'telegram',
      sourceExternalId: '-1001234:42',
      sourceUrl: 'https://t.me/public_team/42',
    }),
    select: { id: true },
  })
  expect((prisma.knowledgeItem.create as jest.Mock).mock.invocationCallOrder[0])
    .toBeLessThan((extractKnowledgeDetailed as jest.Mock).mock.invocationCallOrder[0])
})

it.each([
  ['direct', 'private'],
  ['group', 'supergroup'],
])('creates knowledge from a bound %s message', async (_label, type) => {
  await POST(request(textUpdate({ chat: { id: -1001234, type } })))

  expect(prisma.knowledgeItem.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ source: 'telegram' }),
    select: { id: true },
  })
})

it('accepts edited messages and runs task extraction with Telegram source context', async () => {
  const update = textUpdate()
  const editedUpdate = { update_id: update.update_id, edited_message: update.message }
  await POST(request(editedUpdate))

  expect(extractAndCreateSuggestedTaskFromKnowledgeItem).toHaveBeenCalledWith(expect.objectContaining({
    knowledgeItemId: 'ki-1',
    workspaceId: 'ws-1',
  }))
})

it('retries task extraction when the Telegram KnowledgeItem already exists', async () => {
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue({ id: 'ki-existing' })
  const response = await POST(request(textUpdate()))
  expect(response.status).toBe(200)
  expect(extractAndCreateSuggestedTaskFromKnowledgeItem).toHaveBeenCalledWith({ knowledgeItemId: 'ki-existing', workspaceId: 'ws-1' })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it.each([
  ['/start abcdefghijklmnop', 'private'],
  ['/start@neuron_mcp_bot abcdefghijklmnop', 'supergroup'],
])('binds a chat using %s', async (text, type) => {
  ;(prisma.integration.findMany as jest.Mock).mockResolvedValue([{
    id: 'int-setup',
    workspaceId: 'ws-setup',
    channels: [],
    // Setup codes are single-use and expiring; an unexpired code is required to bind.
    metadata: {
      setupCode: 'abcdefghijklmnop',
      setupCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
  }])

  const response = await POST(request(textUpdate({ text, chat: { id: -1009999, type, title: 'Test team' } })))
  expect(response.status).toBe(200)
  expect(prisma.integration.update).toHaveBeenCalledWith({
    where: { id: 'int-setup' },
    data: expect.objectContaining({
      channels: ['-1009999'],
      teamId: '-1009999',
      teamName: 'Test team',
      metadata: expect.objectContaining({ status: 'connected' }),
    }),
  })
  expect((await response.json()).skippedReasons).toEqual({ binding_command: 1 })
})

it('ignores non-setup bot commands', async () => {
  const response = await POST(request(textUpdate({ text: '/help' })))
  expect(response.status).toBe(200)
  expect((await response.json()).skippedReasons).toEqual({ command: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it('does not duplicate a repeated message', async () => {
  ;(prisma.knowledgeItem.findFirst as jest.Mock)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 'ki-1' })

  await POST(request(textUpdate()))
  const repeated = await POST(request(textUpdate()))
  const body = await repeated.json()

  expect(prisma.knowledgeItem.create).toHaveBeenCalledTimes(1)
  expect(body.skippedReasons).toEqual({ duplicate: 1 })
})

it('skips small talk with a safe reason', async () => {
  const response = await POST(request(textUpdate({ text: 'how are you doing' })))
  const body = await response.json()

  expect(body.skippedReasons).toEqual({ small_talk: 1 })
  expect(prisma.integration.findMany).not.toHaveBeenCalled()
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it.each(['Launch Friday', 'Fix billing', 'Ship auth'])('creates knowledge for useful short action text: %s', async (text) => {
  await POST(request(textUpdate({ text })))

  expect(prisma.knowledgeItem.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ content: text, source: 'telegram' }),
    select: { id: true },
  })
})

it('normalizes whitespace before creating knowledge', async () => {
  await POST(request(textUpdate({ text: '  Launch \n\t Friday  ' })))

  expect(prisma.knowledgeItem.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ content: 'Launch Friday' }),
    select: { id: true },
  })
})

it('creates knowledge from a media caption', async () => {
  await POST(request(textUpdate({
    text: undefined,
    caption: 'The signed customer proposal is ready',
    document: { file_id: 'private-file-id' },
  })))

  expect(prisma.knowledgeItem.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      content: 'The signed customer proposal is ready',
      source: 'telegram',
    }),
    select: { id: true },
  })
})

it('skips a URL-only message', async () => {
  const response = await POST(request(textUpdate({ text: 'https://example.com/private-document' })))
  const body = await response.json()

  expect(body.skippedReasons).toEqual({ url_only: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it('keeps useful-message unbound chat behavior', async () => {
  ;(prisma.integration.findMany as jest.Mock).mockResolvedValue([])

  const response = await POST(request(textUpdate({ text: 'Launch Friday' })))
  const body = await response.json()

  expect(body.skippedReasons).toEqual({ unbound_chat: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it('creates a separate knowledge item for every workspace that connected the same chat', async () => {
  ;(prisma.integration.findMany as jest.Mock).mockResolvedValue([
    { id: 'int-1', workspaceId: 'ws-1' },
    { id: 'int-2', workspaceId: 'ws-2' },
  ])

  const response = await POST(request(textUpdate()))
  const body = await response.json()

  expect(body.messagesProcessed).toBe(2)
  expect(prisma.knowledgeItem.create).toHaveBeenCalledTimes(2)
  expect(prisma.knowledgeItem.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
    data: expect.objectContaining({ workspaceId: 'ws-1' }),
  }))
  expect(prisma.knowledgeItem.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
    data: expect.objectContaining({ workspaceId: 'ws-2' }),
  }))
  expect(prisma.integration.update).toHaveBeenCalledWith({
    where: { id: 'int-1' },
    data: { lastSyncAt: expect.any(Date) },
  })
  expect(prisma.integration.update).toHaveBeenCalledWith({
    where: { id: 'int-2' },
    data: { lastSyncAt: expect.any(Date) },
  })
})

it('skips messages sent by bots', async () => {
  const response = await POST(request(textUpdate({ from: { is_bot: true } })))
  const body = await response.json()

  expect(body.skippedReasons).toEqual({ bot_message: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it('skips unsupported media with a safe reason', async () => {
  const response = await POST(request(textUpdate({ text: undefined, sticker: { file_id: 'private-file-id' } })))
  const body = await response.json()

  expect(body.skippedReasons).toEqual({ unsupported_media: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})
