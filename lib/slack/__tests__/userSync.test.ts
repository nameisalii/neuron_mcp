import { syncSlackUserConnection } from '../userSync'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'

jest.mock('@/lib/db', () => ({
  prisma: {
    slackUserConnection: { findUnique: jest.fn(), update: jest.fn() },
    slackSelectedConversation: { findMany: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn(() => 'xoxp-secret') }))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledgeDetailed: jest.fn() }))
jest.mock('../userClient', () => ({
  createSlackUserClient: jest.fn(() => ({})),
  listUserAccessibleConversations: jest.fn(async () => [
    { id: 'C1', name: 'general', type: 'public_channel' },
    { id: 'G1', name: 'leaders', type: 'private_channel' },
    { id: 'D1', name: 'U2', type: 'im' },
  ]),
  fetchConversationHistory: jest.fn(async ({ channelId }: { channelId: string }) => [
    { ts: '2.0', text: `message-${channelId}`, user: 'U1', channel: channelId },
  ]),
}))

const connection = {
  id: 'suc-1',
  workspaceId: 'ws-1',
  connectedByUserId: 'clerk-1',
  encryptedAccessToken: 'encrypted',
  lastSyncAt: null,
  settings: { publicChannels: true, privateChannels: true, groupDms: false, dms: false, excludedConversationIds: [] },
  teamId: 'T1',
  teamName: 'Acme',
  externalUserId: 'U1',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.slackUserConnection.findUnique as jest.Mock).mockResolvedValue(connection)
  ;(prisma.slackSelectedConversation.findMany as jest.Mock).mockResolvedValue([
    {
      id: 'selected-1',
      conversationId: 'C1',
      conversationName: 'general',
      conversationType: 'public_channel',
      visibility: 'personal',
      lastSyncedAt: null,
    },
  ])
  ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({ items: [], diagnostics: {
    extractorCalled: 1, extractorReturnedEmpty: 0, extractorParseFailed: 0,
    validationFailed: 0, fallbackItemsCreated: 0, knowledgeItemCreateFailed: 0,
    embeddingUpsertFailed: 0, itemProcessingFailed: 0,
  } })
})

it('decrypts the user token and syncs only explicitly selected conversations', async () => {
  const result = await syncSlackUserConnection({
    workspaceId: 'ws-1', userId: 'clerk-1',
  })
  expect(decrypt).toHaveBeenCalledWith('encrypted')
  expect(result.conversationsScanned).toBe(1)
  expect(extractKnowledgeDetailed).toHaveBeenCalledTimes(1)
  expect(extractKnowledgeDetailed).toHaveBeenCalledWith(
    expect.any(Array), 'ws-1', 'slack', expect.anything(), expect.anything(), undefined,
    expect.objectContaining({ namespace: 'ws-1:clerk-1', visibility: 'personal', visibilitySetBy: 'clerk-1' }),
  )
})

it('does not list or sync Slack when no conversations are selected', async () => {
  ;(prisma.slackSelectedConversation.findMany as jest.Mock).mockResolvedValue([])

  const result = await syncSlackUserConnection({ workspaceId: 'ws-1', userId: 'clerk-1' })

  expect(result).toMatchObject({ conversationsScanned: 0, messagesFetched: 0, knowledgeCreated: 0 })
  const { listUserAccessibleConversations, fetchConversationHistory } = jest.requireMock('../userClient')
  expect(listUserAccessibleConversations).not.toHaveBeenCalled()
  expect(fetchConversationHistory).not.toHaveBeenCalled()
  expect(extractKnowledgeDetailed).not.toHaveBeenCalled()
})

it('shares a private conversation only after an explicit saved team selection', async () => {
  ;(prisma.slackSelectedConversation.findMany as jest.Mock).mockResolvedValue([
    {
      id: 'selected-private',
      conversationId: 'G1',
      conversationName: 'leaders',
      conversationType: 'private_channel',
      visibility: 'team',
      lastSyncedAt: null,
    },
  ])

  await syncSlackUserConnection({ workspaceId: 'ws-1', userId: 'clerk-1' })

  expect(extractKnowledgeDetailed).toHaveBeenCalledWith(
    expect.any(Array), 'ws-1', 'slack', expect.anything(), expect.anything(), undefined,
    expect.objectContaining({ visibility: 'team', visibilitySetBy: 'clerk-1' }),
  )
})

it('cannot load or sync another workspace connection', async () => {
  ;(prisma.slackUserConnection.findUnique as jest.Mock).mockResolvedValue(null)
  await expect(syncSlackUserConnection({ workspaceId: 'ws-other', userId: 'clerk-1' }))
    .rejects.toThrow('No personal Slack connection found')
})
