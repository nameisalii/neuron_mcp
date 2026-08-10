import { GET } from '../route'
import { prisma } from '@/lib/db'
import { auth } from '@clerk/nextjs/server'

jest.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) } }))
jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    knowledgeItem: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    decision: { findMany: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const findKnowledge = jest.mocked(prisma.knowledgeItem.findMany)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ workspace: { id: 'workspace-1' } } as never)
  findKnowledge.mockResolvedValue([])
  jest.mocked(prisma.task.findMany).mockResolvedValue([])
  jest.mocked(prisma.decision.findMany).mockResolvedValue([])
})

test('requires authentication', async () => {
  mockAuth.mockResolvedValue({ userId: null } as never)
  const response = await GET()
  expect(response.status).toBe(401)
  expect(findKnowledge).not.toHaveBeenCalled()
})

test('is workspace and visibility scoped and selects no KnowledgeItem title', async () => {
  await GET()
  expect(prisma.user.findUnique).toHaveBeenCalledWith({
    where: { clerkId: 'user-1' },
    select: { workspace: { select: { id: true } } },
  })
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
