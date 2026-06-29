/** @jest-environment node */
import { syncDiscord } from '../sync'
import { listGuildChannels, getChannelMessages } from '@/lib/discord/api'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'

jest.mock('@/lib/discord/api', () => ({
  listGuildChannels: jest.fn(),
  getChannelMessages: jest.fn(),
  READABLE_CHANNEL_TYPES: new Set([0, 5]),
  DiscordApiError: class extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledgeDetailed: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn().mockResolvedValue(undefined) }))

const diagnostics = {
  extractorCalled: 1,
  extractorReturnedEmpty: 0,
  extractorParseFailed: 0,
  validationFailed: 0,
  fallbackItemsCreated: 0,
  knowledgeItemCreateFailed: 0,
  embeddingUpsertFailed: 0,
  itemProcessingFailed: 0,
}

const BOT_TOKEN = 'discord-bot-secret-token'
const PRIVATE_MESSAGE = 'internal: launch is delayed to Q4 do not share'

beforeEach(() => {
  jest.clearAllMocks()
  ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({
    items: [{ content: 'Launch delayed to Q4', category: 'status_update', owner: null, confidence: 0.8 }],
    diagnostics,
  })
})

it('creates KnowledgeItems from human messages with discord attribution and skips bots/system', async () => {
  ;(listGuildChannels as jest.Mock).mockResolvedValue([{ id: 'c1', name: 'general', type: 0 }])
  ;(getChannelMessages as jest.Mock).mockResolvedValue([
    { id: 'm1', content: PRIVATE_MESSAGE, timestamp: '2026-06-10T10:00:00.000Z', type: 0, author: { id: 'u1', username: 'alex' } },
    { id: 'm2', content: 'beep boop', timestamp: '2026-06-10T10:01:00.000Z', type: 0, author: { id: 'b1', username: 'bot', bot: true } },
    { id: 'm3', content: '', timestamp: '2026-06-10T10:02:00.000Z', type: 0, author: { id: 'u2', username: 'sam' } },
    { id: 'm4', content: 'joined the server', timestamp: '2026-06-10T10:03:00.000Z', type: 7, author: { id: 'u3', username: 'joiner' } },
  ])

  const result = await syncDiscord({
    workspaceId: 'ws-1',
    guildId: 'guild-1',
    botToken: BOT_TOKEN,
    syncedBy: 'user-1',
    syncedByName: 'Alex',
  })

  expect(result.messagesFetched).toBe(1) // only the human, non-empty message
  expect(result.knowledgeCreated).toBe(1)
  expect(result.canReadMessages).toBe(true)
  expect(extractKnowledgeDetailed).toHaveBeenCalledWith(
    expect.any(Array),
    'ws-1',
    'discord',
    'https://discord.com/channels/guild-1/c1',
    'c1',
  )
})

it('returns a clear permissions message when no readable messages are found', async () => {
  ;(listGuildChannels as jest.Mock).mockResolvedValue([{ id: 'c1', name: 'general', type: 0 }])
  ;(getChannelMessages as jest.Mock).mockResolvedValue([])

  const result = await syncDiscord({
    workspaceId: 'ws-1',
    guildId: 'guild-1',
    botToken: BOT_TOKEN,
    syncedBy: 'user-1',
    syncedByName: 'Alex',
  })

  expect(result.messagesFetched).toBe(0)
  expect(result.message).toContain('View Channel and Read Message History')
  expect(extractKnowledgeDetailed).not.toHaveBeenCalled()
})

it('never logs the bot token or raw message content', async () => {
  const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  ;(listGuildChannels as jest.Mock).mockResolvedValue([{ id: 'c1', name: 'secret-channel', type: 0 }])
  ;(getChannelMessages as jest.Mock).mockResolvedValue([
    { id: 'm1', content: PRIVATE_MESSAGE, timestamp: '2026-06-10T10:00:00.000Z', type: 0, author: { id: 'u1', username: 'alex' } },
  ])

  await syncDiscord({
    workspaceId: 'ws-1',
    guildId: 'guild-1',
    botToken: BOT_TOKEN,
    syncedBy: 'user-1',
    syncedByName: 'Alex',
  })

  const logged = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls])
  expect(logged).not.toContain(BOT_TOKEN)
  expect(logged).not.toContain(PRIVATE_MESSAGE)
  expect(logged).not.toContain('secret-channel')

  infoSpy.mockRestore()
  errorSpy.mockRestore()
})
