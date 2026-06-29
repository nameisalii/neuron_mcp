/** @jest-environment node */
import { POST } from '../route'
import { prisma } from '@/lib/db'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'

jest.mock('@/lib/db', () => ({
  prisma: {
    integration: {
      findFirst: jest.fn(),
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
  ;(prisma.integration.findFirst as jest.Mock).mockResolvedValue(integration)
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
  jest.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('rejects a wrong secret token', async () => {
  const response = await POST(request(textUpdate(), 'wrong-secret'))
  expect(response.status).toBe(401)
  expect(prisma.integration.findFirst).not.toHaveBeenCalled()
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
  expect(prisma.integration.findFirst).not.toHaveBeenCalled()
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

it('skips a URL-only message', async () => {
  const response = await POST(request(textUpdate({ text: 'https://example.com/private-document' })))
  const body = await response.json()

  expect(body.skippedReasons).toEqual({ url_only: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it('keeps useful-message unbound chat behavior', async () => {
  ;(prisma.integration.findFirst as jest.Mock).mockResolvedValue(null)

  const response = await POST(request(textUpdate({ text: 'Launch Friday' })))
  const body = await response.json()

  expect(body.skippedReasons).toEqual({ unbound_chat: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
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
