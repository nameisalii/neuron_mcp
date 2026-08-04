/** @jest-environment node */
import { GET, POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { activeSlackUserToken } from '@/lib/slack/userSync'
import { listUserAccessibleConversations } from '@/lib/slack/userClient'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn() }))
jest.mock('@/lib/slack/userSync', () => ({ activeSlackUserToken: jest.fn(() => 'server-token') }))
jest.mock('@/lib/slack/userClient', () => ({
  createSlackUserClient: jest.fn(() => ({})),
  listUserAccessibleConversations: jest.fn(),
  SlackUserAccessError: class SlackUserAccessError extends Error {},
}))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    slackUserConnection: { findUnique: jest.fn() },
    slackSelectedConversation: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn((args) => args),
    },
    $transaction: jest.fn(async (operations) => operations),
  },
}))

const connection = {
  id: 'connection-1',
  workspaceId: 'workspace-1',
  connectedByUserId: 'user-1',
  encryptedAccessToken: 'encrypted-secret',
  encryptedRefreshToken: null,
  tokenExpiresAt: null,
  teamId: 'team-1',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ workspace: { id: 'workspace-1' } })
  ;(prisma.slackUserConnection.findUnique as jest.Mock).mockResolvedValue(connection)
  ;(listUserAccessibleConversations as jest.Mock).mockResolvedValue([
    { id: 'C1', name: 'general', type: 'public_channel' },
    { id: 'D1', name: 'Ali', type: 'im' },
  ])
  ;(prisma.slackSelectedConversation.findMany as jest.Mock).mockResolvedValue([
    {
      id: 'row-1', conversationId: 'C1', conversationName: 'general',
      conversationType: 'public_channel', selected: false, syncEnabled: false,
      visibility: 'personal', lastSyncedAt: null, lastMessageAt: null,
    },
  ])
})

it('discovers and upserts safe conversations without returning a token', async () => {
  const response = await GET()
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(activeSlackUserToken).toHaveBeenCalledWith(connection)
  expect(prisma.slackSelectedConversation.upsert).toHaveBeenCalledTimes(2)
  expect(body.conversations[0]).toMatchObject({ id: 'C1', name: 'general', visibility: 'personal' })
  expect(JSON.stringify(body)).not.toContain('server-token')
  expect(JSON.stringify(body)).not.toContain('encrypted-secret')
})

it('validates saved IDs against the authenticated user connection and honors an explicit visibility choice', async () => {
  ;(prisma.slackSelectedConversation.findMany as jest.Mock).mockResolvedValue([
    { id: 'row-dm', conversationId: 'D1', conversationType: 'im' },
  ])
  const response = await POST(new Request('http://localhost/api/integrations/slack/conversations', {
    method: 'POST',
    body: JSON.stringify({
      conversations: [{ id: 'D1', selected: true, syncEnabled: true, visibility: 'team' }],
    }),
  }))

  expect(response.status).toBe(200)
  expect(prisma.slackSelectedConversation.update).toHaveBeenCalledWith({
    where: { id: 'row-dm' },
    data: { selected: true, syncEnabled: true, visibility: 'team' },
  })
})

it('rejects conversation IDs not discovered for this connection', async () => {
  ;(prisma.slackSelectedConversation.findMany as jest.Mock).mockResolvedValue([])
  const response = await POST(new Request('http://localhost/api/integrations/slack/conversations', {
    method: 'POST',
    body: JSON.stringify({
      conversations: [{ id: 'OTHER', selected: true, syncEnabled: true, visibility: 'personal' }],
    }),
  }))
  expect(response.status).toBe(400)
  expect(prisma.$transaction).not.toHaveBeenCalled()
})
