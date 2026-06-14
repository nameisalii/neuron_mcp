/** @jest-environment node */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { deleteEmbeddings } from '@/lib/pinecone'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ deleteEmbeddings: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    integration: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    knowledgeItem: { findMany: jest.fn(), deleteMany: jest.fn() },
    notionChunk: { findMany: jest.fn() },
    notionPage: { deleteMany: jest.fn() },
    syncStatus: { updateMany: jest.fn() },
  },
}))

const request = new Request('http://localhost/api/integrations/notion/reset', { method: 'POST' }) as never

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ workspace: { id: 'ws-1' } })
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ role: 'owner', displayName: 'Ali' })
  ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue({ id: 'int-1' })
  ;(prisma.knowledgeItem.findMany as jest.Mock).mockResolvedValue([{ id: 'ki-1', embeddingId: 'ki-1' }])
  ;(prisma.knowledgeItem.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })
  ;(prisma.notionChunk.findMany as jest.Mock).mockResolvedValue([{ pineconeId: 'notion-vector' }])
  ;(prisma.notionPage.deleteMany as jest.Mock).mockResolvedValue({ count: 2 })
})

it('resets only the requested integration data', async () => {
  const res = await POST(request, { params: Promise.resolve({ type: 'notion' }) })
  expect(res.status).toBe(200)
  expect(prisma.knowledgeItem.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1', source: 'notion' } })
  expect(prisma.notionPage.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1' } })
  expect(deleteEmbeddings).toHaveBeenCalledWith(expect.arrayContaining(['ki-1', 'notion-vector']))
  expect(prisma.integration.delete).toHaveBeenCalledWith({ where: { id: 'int-1' } })
  expect(prisma.integration.update).not.toHaveBeenCalled()
})

it('does not delete Notion pages when resetting Linear', async () => {
  await POST(request, { params: Promise.resolve({ type: 'linear' }) })
  expect(prisma.knowledgeItem.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1', source: 'linear' } })
  expect(prisma.notionPage.deleteMany).not.toHaveBeenCalled()
  expect(prisma.integration.delete).not.toHaveBeenCalled()
})
