/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    activityEvent: { create: jest.fn() },
  },
}))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockWorkspace = jest.mocked(requireWorkspaceMember)
const mockUser = jest.mocked(prisma.user.findUnique)
const mockCreate = jest.mocked(prisma.activityEvent.create)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockWorkspace.mockResolvedValue({ workspaceId: 'workspace-1', member: { displayName: 'Ali' } } as never)
  mockUser.mockResolvedValue({ email: 'ali@example.com' } as never)
  mockCreate.mockResolvedValue({ id: 'feedback-1' } as never)
})

it('requires authentication', async () => {
  mockAuth.mockResolvedValue({ userId: null } as never)
  const response = await POST(new Request('http://localhost/api/feedback', {
    method: 'POST',
    body: JSON.stringify({ type: 'Bug report', message: 'Something broke.' }),
  }))
  expect(response.status).toBe(401)
  expect(mockCreate).not.toHaveBeenCalled()
})

it('validates feedback input', async () => {
  const response = await POST(new Request('http://localhost/api/feedback', {
    method: 'POST',
    body: JSON.stringify({ type: 'Unknown', message: 'no' }),
  }))
  expect(response.status).toBe(400)
  expect(mockCreate).not.toHaveBeenCalled()
})

it('stores feedback in the authenticated workspace', async () => {
  const response = await POST(new Request('http://localhost/api/feedback', {
    method: 'POST',
    body: JSON.stringify({ type: 'Feature request', message: 'Please add a useful export.', page: '/dashboard/tasks' }),
  }))
  expect(response.status).toBe(201)
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      eventType: 'feedback_submitted',
      metadata: expect.objectContaining({ type: 'Feature request', page: '/dashboard/tasks' }),
    }),
  }))
})
