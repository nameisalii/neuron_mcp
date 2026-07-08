/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { trackEvent } from '@/lib/activity'
import { deleteEmbeddings } from '@/lib/pinecone'
import { POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ deleteEmbeddings: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    knowledgeItem: { findMany: jest.fn(), deleteMany: jest.fn() },
    documentAttachment: { deleteMany: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockTransaction = jest.mocked(prisma.$transaction)
const mockTrackEvent = jest.mocked(trackEvent)
const mockDeleteEmbeddings = jest.mocked(deleteEmbeddings)
const mockKnowledgeFindMany = jest.mocked(prisma.knowledgeItem.findMany)
const mockKnowledgeDeleteMany = jest.mocked(prisma.knowledgeItem.deleteMany)
const mockDocumentDeleteMany = jest.mocked(prisma.documentAttachment.deleteMany)

const tx = {
  integration: { deleteMany: jest.fn() },
  apiConnector: { deleteMany: jest.fn() },
  syncStatus: { updateMany: jest.fn() },
}

function request(type: string) {
  return POST(new Request(`http://localhost/api/integrations/${type}/disconnect`, { method: 'POST' }), {
    params: Promise.resolve({ source: type }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({
    workspaceId: 'workspace-1',
    member: { role: 'admin', status: 'active', displayName: 'Ali' },
  } as never)
  tx.integration.deleteMany.mockResolvedValue({ count: 1 })
  tx.apiConnector.deleteMany.mockResolvedValue({ count: 1 })
  tx.syncStatus.updateMany.mockResolvedValue({ count: 1 })
  mockKnowledgeFindMany.mockResolvedValue([])
  mockKnowledgeDeleteMany.mockResolvedValue({ count: 0 })
  mockDocumentDeleteMany.mockResolvedValue({ count: 0 })
  ;(mockTransaction as unknown as jest.Mock).mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx))
  mockTrackEvent.mockResolvedValue(undefined)
  mockDeleteEmbeddings.mockResolvedValue(undefined)
})

it('returns 401 when unauthenticated', async () => {
  mockAuth.mockResolvedValue({ userId: null } as never)

  const res = await request('slack')

  expect(res.status).toBe(401)
  expect(mockTransaction).not.toHaveBeenCalled()
})

it('rejects users outside the workspace', async () => {
  mockRequireWorkspaceMember.mockResolvedValue({ error: 'Forbidden', status: 403 } as never)

  const res = await request('slack')

  expect(res.status).toBe(403)
  expect(mockTransaction).not.toHaveBeenCalled()
})

it('disconnects an integration without deleting imported knowledge', async () => {
  const res = await request('telegram')

  expect(res.status).toBe(200)
  expect(tx.integration.deleteMany).toHaveBeenCalledWith({
    where: { workspaceId: 'workspace-1', type: 'telegram' },
  })
  expect(tx.syncStatus.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { workspaceId: 'workspace-1', integration: 'telegram' },
    data: expect.objectContaining({ status: 'paused', lastSyncAt: null, nextSyncAt: null }),
  }))
  expect(mockKnowledgeFindMany).not.toHaveBeenCalled()
  expect(mockKnowledgeDeleteMany).not.toHaveBeenCalled()
  expect(mockDocumentDeleteMany).not.toHaveBeenCalled()
  const json = await res.json()
  expect(json).toEqual(expect.objectContaining({
    success: true,
    integration: 'telegram',
    disconnected: true,
    removedWebhookBindings: true,
  }))
})

it('can also delete imported knowledge items when requested', async () => {
  mockKnowledgeFindMany.mockResolvedValue([
    { id: 'ki-1', embeddingId: 'vec-1' },
    { id: 'ki-2', embeddingId: null },
  ] as never)
  mockKnowledgeDeleteMany.mockResolvedValue({ count: 2 })
  mockDocumentDeleteMany.mockResolvedValue({ count: 1 })

  const req = new Request('http://localhost/api/integrations/slack/disconnect', {
    method: 'POST',
    body: JSON.stringify({ deleteKnowledgeItems: true }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await POST(req, { params: Promise.resolve({ source: 'slack' }) })

  expect(res.status).toBe(200)
  expect(mockKnowledgeFindMany).toHaveBeenCalledWith({
    where: { workspaceId: 'workspace-1', source: 'slack' },
    select: { id: true, embeddingId: true },
  })
  expect(mockDeleteEmbeddings).toHaveBeenCalledWith(['vec-1', 'ki-2'])
  expect(mockKnowledgeDeleteMany).toHaveBeenCalledWith({
    where: { workspaceId: 'workspace-1', source: 'slack' },
  })
  expect(mockDocumentDeleteMany).toHaveBeenCalledWith({
    where: { workspaceId: 'workspace-1', source: 'slack' },
  })
  const json = await res.json()
  expect(json).toEqual(expect.objectContaining({
    removedKnowledgeItems: 2,
    removedDocumentAttachments: 1,
  }))
})

it('returns a warning instead of a 500 when optional knowledge cleanup fails', async () => {
  mockKnowledgeFindMany.mockRejectedValue(new Error('db down'))

  const req = new Request('http://localhost/api/integrations/slack/disconnect', {
    method: 'POST',
    body: JSON.stringify({ deleteKnowledgeItems: true }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await POST(req, { params: Promise.resolve({ source: 'slack' }) })

  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json.warnings).toEqual(expect.arrayContaining(['Imported knowledge could not be fully removed from search indexes.']))
})

it('disconnects Datatruck by removing the workspace ApiConnector only', async () => {
  const res = await request('datatruck')

  expect(res.status).toBe(200)
  expect(tx.apiConnector.deleteMany).toHaveBeenCalledWith({
    where: { workspaceId: 'workspace-1', sourceKey: 'datatruck' },
  })
  expect(tx.integration.deleteMany).not.toHaveBeenCalled()
})

it('is idempotent when an integration is already disconnected', async () => {
  tx.integration.deleteMany.mockResolvedValue({ count: 0 })

  const res = await request('slack')

  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json.removedConnectionRecords).toBe(0)
})

it('rejects unsupported integration types', async () => {
  const res = await request('unknown')

  expect(res.status).toBe(400)
  expect(mockTransaction).not.toHaveBeenCalled()
})
