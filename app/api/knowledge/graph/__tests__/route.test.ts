import { GET } from '../route'
import { prisma } from '@/lib/db'
import { knowledgeRequestContext } from '@/lib/knowledge/api'

jest.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) } }))
jest.mock('@/lib/knowledge/api', () => ({ knowledgeRequestContext: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    decision: { findMany: jest.fn() },
  },
}))

const context = jest.mocked(knowledgeRequestContext)
const findKnowledge = jest.mocked(prisma.knowledgeItem.findMany)

beforeEach(() => {
  jest.clearAllMocks()
  context.mockResolvedValue({ response: null, userId: 'user-1', workspaceId: 'workspace-1' })
  findKnowledge.mockResolvedValue([])
  jest.mocked(prisma.task.findMany).mockResolvedValue([])
  jest.mocked(prisma.decision.findMany).mockResolvedValue([])
})

test('requires authentication through the shared request context', async () => {
  context.mockResolvedValue({ response: { status: 401, json: async () => ({ error: 'Unauthorized' }) } as never })
  const response = await GET()
  expect(response.status).toBe(401)
  expect(findKnowledge).not.toHaveBeenCalled()
})

test('is workspace and visibility scoped and selects no KnowledgeItem title', async () => {
  await GET()
  expect(findKnowledge).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      workspaceId: 'workspace-1',
      OR: [{ visibility: 'team' }, { visibility: 'personal', visibilitySetBy: 'user-1' }],
    }),
    select: expect.not.objectContaining({ title: expect.anything() }),
  }))
  expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'workspace-1' }) }))
  expect(prisma.decision.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'workspace-1' } }))
})

test('returns an empty normalized graph', async () => {
  const response = await GET()
  expect(await response.json()).toEqual({ nodes: [], edges: [], stats: { totalKnowledge: 0, totalSources: 0, totalEdges: 0, largestNodeSize: 0 } })
})
