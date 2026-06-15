/** @jest-environment node */
import { GET, PATCH } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    workspace: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}))

const mockAuth = jest.mocked(auth)
const mockFindFirst = jest.mocked(prisma.workspace.findFirst)
const mockUpdate = jest.mocked(prisma.workspace.update)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'clerk-user' } as never)
})

it('finds the workspace through its owner Clerk ID', async () => {
  mockFindFirst.mockResolvedValue({ id: 'workspace-1' } as never)

  const response = await GET(new Request('http://localhost/api/workspace'))

  expect(response.status).toBe(200)
  expect(mockFindFirst).toHaveBeenCalledWith({
    where: { owner: { clerkId: 'clerk-user' } },
    include: { members: { where: { status: 'active' } } },
  })
})

it('updates the workspace found through its owner Clerk ID', async () => {
  mockFindFirst.mockResolvedValue({ id: 'workspace-1' } as never)
  mockUpdate.mockResolvedValue({ id: 'workspace-1', type: 'team' } as never)

  const response = await PATCH(new Request('http://localhost/api/workspace', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'team' }),
  }))

  expect(response.status).toBe(200)
  expect(mockFindFirst).toHaveBeenCalledWith({
    where: { owner: { clerkId: 'clerk-user' } },
  })
  expect(mockUpdate).toHaveBeenCalledWith({
    where: { id: 'workspace-1' },
    data: { type: 'team' },
  })
})
