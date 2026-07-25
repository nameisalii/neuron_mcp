/** @jest-environment node */
import { GET, PATCH } from '../route'
import { prisma } from '@/lib/db'

jest.mock('@/lib/knowledge/api', () => ({ knowledgeRequestContext: jest.fn().mockResolvedValue({ userId: 'user-1', workspaceId: 'ws-1' }) }))
jest.mock('@/lib/db', () => ({ prisma: {
  knowledgeItem: { findFirst: jest.fn(), update: jest.fn() }, task: { findMany: jest.fn() },
  decision: { findMany: jest.fn() }, documentAttachment: { findMany: jest.fn() },
} }))

const item = { id: 'ki-1', workspaceId: 'ws-1', content: 'Company policy', category: 'policy', source: 'manual', sourceMetadata: null, verified: false, frozen: false, conflictNote: null, createdAt: new Date() }
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(prisma.knowledgeItem.findFirst).mockResolvedValue(item as never)
  jest.mocked(prisma.knowledgeItem.update).mockResolvedValue(item as never)
  jest.mocked(prisma.task.findMany).mockResolvedValue([]); jest.mocked(prisma.decision.findMany).mockResolvedValue([]); jest.mocked(prisma.documentAttachment.findMany).mockResolvedValue([])
})

it('loads detail and related data within the current workspace', async () => {
  const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'ki-1' }) })
  expect(response.status).toBe(200)
  expect(prisma.knowledgeItem.findFirst).toHaveBeenCalledWith({ where: { id: 'ki-1', workspaceId: 'ws-1' } })
})

it('updates lifecycle fields without allowing cross-workspace lookup', async () => {
  const response = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'outdated', tags: ['policy'] }) }), { params: Promise.resolve({ id: 'ki-1' }) })
  expect(response.status).toBe(200)
  expect(prisma.knowledgeItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ki-1' }, data: expect.objectContaining({ sourceMetadata: expect.objectContaining({ knowledgeStatus: 'outdated', tags: ['policy'] }), verified: false }) }))
})

it('returns 404 when the item is outside the workspace', async () => {
  jest.mocked(prisma.knowledgeItem.findFirst).mockResolvedValue(null)
  expect((await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'other' }) })).status).toBe(404)
})
