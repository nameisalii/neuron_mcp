/** @jest-environment node */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { syncSlackMessagesDetailed } from '@/lib/slack/sync'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    integration: { update: jest.fn() },
    knowledgeItem: { count: jest.fn() },
  },
}))
jest.mock('@/lib/slack/sync', () => ({ syncSlackMessagesDetailed: jest.fn() }))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledgeDetailed: jest.fn() }))

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

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
    workspace: { id: 'ws-1', integrations: [{ id: 'int-1', lastSyncAt: null }] },
  })
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ role: 'member' })
  ;(syncSlackMessagesDetailed as jest.Mock).mockResolvedValue({
    messages: [{ text: 'Deploys happen Tuesday', user: 'U1', channel: 'C1', ts: '1000.0' }],
    channelsDiscovered: 1,
    channelsScanned: 1,
    channelsSkipped: 0,
    skippedReasons: {},
  })
  ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({
    items: [{ content: 'Deploys happen Tuesday', category: 'fact', owner: null, confidence: 0.9 }],
    diagnostics,
  })
  ;(prisma.integration.update as jest.Mock).mockResolvedValue({})
  ;(prisma.knowledgeItem.count as jest.Mock).mockResolvedValue(0)
})

it('returns normalized Slack knowledge ingestion counts', async () => {
  const res = await POST()

  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({
    success: true,
    fetched: 1,
    processed: 1,
    knowledgeCreated: 1,
    knowledgeUpdated: 0,
    skipped: 0,
  })
  expect(prisma.integration.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { workspaceId_type: { workspaceId: 'ws-1', type: 'slack' } },
  }))
})

it('does not silently return 200 when every Slack extraction fails', async () => {
  ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({
    items: [],
    diagnostics: { ...diagnostics, extractorParseFailed: 1 },
  })

  const res = await POST()

  expect(res.status).toBe(502)
  expect(await res.json()).toMatchObject({
    success: false,
    fetched: 1,
    knowledgeCreated: 0,
    error: expect.stringContaining('extraction failed'),
  })
  expect(prisma.integration.update).not.toHaveBeenCalled()
})

it('returns a clear reason when Slack has no accessible messages', async () => {
  ;(syncSlackMessagesDetailed as jest.Mock).mockResolvedValue({
    messages: [],
    channelsDiscovered: 0,
    channelsScanned: 0,
    channelsSkipped: 0,
    skippedReasons: { no_joined_channels: 1 },
  })
  ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({ items: [], diagnostics: { ...diagnostics, extractorCalled: 0 } })

  const res = await POST()

  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({
    success: true,
    fetched: 0,
    message: expect.stringContaining('Invite the Neuron bot'),
    skippedReasons: expect.objectContaining({ no_joined_channels: 1 }),
  })
})
