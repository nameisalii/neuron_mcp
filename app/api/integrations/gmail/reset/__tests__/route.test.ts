/** @jest-environment node */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { deleteEmbeddingsInNamespace } from '@/lib/pinecone'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    integration: { findUnique: jest.fn(), update: jest.fn() },
    emailThread: { findMany: jest.fn(), deleteMany: jest.fn() },
    emailChunk: { findMany: jest.fn(), deleteMany: jest.fn() },
    knowledgeItem: { findMany: jest.fn(), deleteMany: jest.fn() },
    syncStatus: { upsert: jest.fn() },
  },
}))
jest.mock('@/lib/pinecone', () => ({ deleteEmbeddingsInNamespace: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockIntegrationFind = jest.mocked(prisma.integration.findUnique)
const mockEmailThreadFind = jest.mocked(prisma.emailThread.findMany)
const mockEmailChunkFind = jest.mocked(prisma.emailChunk.findMany)
const mockKnowledgeFind = jest.mocked(prisma.knowledgeItem.findMany)
const mockEmailThreadDelete = jest.mocked(prisma.emailThread.deleteMany)
const mockEmailChunkDelete = jest.mocked(prisma.emailChunk.deleteMany)
const mockKnowledgeDelete = jest.mocked(prisma.knowledgeItem.deleteMany)
const mockIntegrationUpdate = jest.mocked(prisma.integration.update)
const mockSyncStatusUpsert = jest.mocked(prisma.syncStatus.upsert)
const mockDeleteEmbeddings = jest.mocked(deleteEmbeddingsInNamespace)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  mockMemberFind.mockResolvedValue({ role: 'owner', displayName: 'Ali' } as never)
  mockIntegrationFind.mockResolvedValue({ id: 'int-1', metadata: null } as never)
  mockEmailThreadFind.mockResolvedValue([
    { id: 'thread-db-1', gmailThreadId: 'gmail-thread-1', chunks: [] },
  ] as never)
  mockEmailChunkFind.mockResolvedValue([
    { id: 'chunk-1', pineconeId: 'chunk-pin-1' },
  ] as never)
  mockKnowledgeFind.mockResolvedValue([
    { id: 'ki-1', embeddingId: 'ki-pin-1' },
  ] as never)
  mockEmailThreadDelete.mockResolvedValue({ count: 1 } as never)
  mockEmailChunkDelete.mockResolvedValue({ count: 1 } as never)
  mockKnowledgeDelete.mockResolvedValue({ count: 1 } as never)
  mockIntegrationUpdate.mockResolvedValue({} as never)
  mockSyncStatusUpsert.mockResolvedValue({} as never)
  mockDeleteEmbeddings.mockResolvedValue(undefined)
})

it('deletes only Gmail data for the authenticated user', async () => {
  const res = await POST()
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)
  expect(body.deleted).toBe(3)
  expect(mockDeleteEmbeddings).toHaveBeenCalledWith(expect.arrayContaining(['chunk-pin-1', 'ki-pin-1']), 'ws-1:user-1')
  expect(mockIntegrationUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { workspaceId_type: { workspaceId: 'ws-1', type: 'gmail' } },
  }))
})

