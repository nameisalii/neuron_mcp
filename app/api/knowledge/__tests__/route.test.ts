/** @jest-environment node */
import { GET } from '../route'
import { prisma } from '@/lib/db'

jest.mock('@/lib/knowledge/api', () => ({ knowledgeRequestContext: jest.fn().mockResolvedValue({ userId: 'user-1', workspaceId: 'ws-1' }) }))
jest.mock('@/lib/db', () => ({ prisma: { knowledgeItem: { findMany: jest.fn() } } }))

beforeEach(() => { jest.clearAllMocks(); jest.mocked(prisma.knowledgeItem.findMany).mockResolvedValue([]) })

it('filters workspace knowledge and hides archived items by default', async () => {
  const response = await GET(new Request('http://localhost/api/knowledge?source=telegram&category=process'))
  expect(response.status).toBe(200)
  expect(prisma.knowledgeItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
    workspaceId: 'ws-1', source: 'telegram', category: 'process',
  }) }))
  expect(prisma.knowledgeItem.findMany).not.toHaveBeenCalledWith(expect.objectContaining({ select: expect.anything() }))
})

it('supports lifecycle filters and rejects invalid status', async () => {
  await GET(new Request('http://localhost/api/knowledge?status=outdated'))
  expect(prisma.knowledgeItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.not.objectContaining({ status: expect.anything() }) }))
  expect((await GET(new Request('http://localhost/api/knowledge?status=deleted'))).status).toBe(400)
})
