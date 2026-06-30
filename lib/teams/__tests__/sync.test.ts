/** @jest-environment node */
import { prisma } from '@/lib/db'
import { syncTeams } from '../sync'
import {
  decodeTeamsToken,
  refreshTeamsToken,
  listJoinedTeams,
  listTeamChannels,
  listChannelMessages,
} from '../api'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'

jest.mock('@/lib/db', () => ({
  prisma: {
    integration: { update: jest.fn() },
    knowledgeItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))
jest.mock('../api', () => ({
  TeamsApiError: class TeamsApiError extends Error {
    constructor(message: string, public status: number, public code?: string) {
      super(message)
    }
  },
  decodeTeamsToken: jest.fn(),
  encodeTeamsToken: jest.fn(() => 'encrypted-next'),
  refreshTeamsToken: jest.fn(),
  listJoinedTeams: jest.fn(),
  listTeamChannels: jest.fn(),
  listChannelMessages: jest.fn(),
}))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn() }))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledgeDetailed: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const token = { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000 }
const baseParams = {
  workspaceId: 'ws-1',
  integrationId: 'int-1',
  encryptedToken: 'encrypted-token',
  selectedChannels: [] as string[],
  syncedBy: 'user-1',
  syncedByName: 'Ali',
}

function graphMessage(content = '<p>Launch <b>Friday</b></p>') {
  return {
    id: 'msg-1',
    messageType: 'message',
    createdDateTime: '2026-06-29T12:00:00Z',
    deletedDateTime: null,
    webUrl: 'https://teams.microsoft.com/l/message/msg-1',
    from: { user: { id: 'user-a', displayName: 'Ali' } },
    body: { contentType: 'html', content },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(decodeTeamsToken as jest.Mock).mockReturnValue(token)
  ;(refreshTeamsToken as jest.Mock).mockResolvedValue(token)
  ;(listJoinedTeams as jest.Mock).mockResolvedValue([{ id: 'team-1', displayName: 'Product' }])
  ;(listTeamChannels as jest.Mock).mockResolvedValue([{ id: 'channel-1', displayName: 'General' }])
  ;(listChannelMessages as jest.Mock).mockResolvedValue([graphMessage()])
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue(null)
  ;(prisma.knowledgeItem.create as jest.Mock).mockResolvedValue({ id: 'ki-1' })
  ;(prisma.knowledgeItem.update as jest.Mock).mockResolvedValue({ id: 'ki-1' })
  ;(prisma.integration.update as jest.Mock).mockResolvedValue({ id: 'int-1' })
  ;(generateEmbedding as jest.Mock).mockResolvedValue([0.1])
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

it('returns reconnect-needed if token refresh fails', async () => {
  ;(refreshTeamsToken as jest.Mock).mockRejectedValue(new Error('expired'))

  const result = await syncTeams(baseParams)

  expect(result).toMatchObject({
    success: false,
    reconnectNeeded: true,
  })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it('creates a KnowledgeItem from a mocked Teams message and strips HTML', async () => {
  const result = await syncTeams(baseParams)

  expect(result.knowledgeCreated).toBe(1)
  expect(prisma.knowledgeItem.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      workspaceId: 'ws-1',
      content: 'Launch Friday',
      source: 'teams',
      sourceExternalId: 'team-1:channel-1:msg-1',
      sourceUrl: 'https://teams.microsoft.com/l/message/msg-1',
      sourceMetadata: expect.objectContaining({
        teamId: 'team-1',
        channelId: 'channel-1',
        messageId: 'msg-1',
        fromDisplayName: 'Ali',
      }),
    }),
    select: { id: true },
  })
})

it.each([
  ['hi', 'small_talk'],
  ['👍', 'emoji_only'],
  ['https://example.com/private', 'url_only'],
])('skips low-quality Teams message %p', async (content, reason) => {
  ;(listChannelMessages as jest.Mock).mockResolvedValue([graphMessage(content)])

  const result = await syncTeams(baseParams)

  expect(result.skippedReasons).toEqual({ [reason]: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it.each(['Launch Friday', 'Fix billing'])('does not skip useful short Teams messages: %s', async (content) => {
  ;(listChannelMessages as jest.Mock).mockResolvedValue([graphMessage(content)])

  await syncTeams(baseParams)

  expect(prisma.knowledgeItem.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ content, source: 'teams' }),
    select: { id: true },
  })
})

it('does not duplicate a repeated Teams message', async () => {
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' })

  const result = await syncTeams(baseParams)

  expect(result.skippedReasons).toEqual({ duplicate: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})
