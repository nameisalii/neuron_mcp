/** @jest-environment node */
import { GET, POST as CREATE } from '../route'
import { PATCH } from '../[id]/route'
import { POST as APPROVE } from '../[id]/approve/route'
import { POST as DECLINE } from '../[id]/decline/route'
import { POST as COMPLETE } from '../[id]/complete/route'
import { POST as REOPEN } from '../[id]/reopen/route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ prisma: {
  user: { findUnique: jest.fn() }, workspaceMember: { findUnique: jest.fn() },
  task: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  activityEvent: { create: jest.fn() },
} }))

const task = { id: 'task-1', workspaceId: 'ws-1', title: 'Send invoice', status: 'suggested', completedAt: null }
const props = { params: Promise.resolve({ id: 'task-1' }) }
const request = (url: string, method = 'GET', body?: unknown) => new Request(url, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(auth).mockResolvedValue({ userId: 'clerk-1' } as never)
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  jest.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({ role: 'member', status: 'active', displayName: 'Ali' } as never)
  jest.mocked(prisma.task.findFirst).mockResolvedValue(task as never)
  jest.mocked(prisma.task.findMany).mockResolvedValue([task] as never)
  jest.mocked(prisma.task.create).mockResolvedValue({ ...task, status: 'active' } as never)
  jest.mocked(prisma.task.update).mockResolvedValue({ ...task, status: 'active' } as never)
  jest.mocked(prisma.activityEvent.create).mockResolvedValue({} as never)
})

test('creates a manual active task for the current user', async () => {
  const response = await CREATE(request('http://local/api/tasks', 'POST', { title: 'Write launch plan', category: 'startup', priority: 'high' }))
  expect(response?.status).toBe(201)
  expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'ws-1', createdByUserId: 'clerk-1', sourceType: 'manual', status: 'active' }) }))
})

test.each(['manual', 'slack', 'gmail', 'telegram'] as const)('creates a task with %s source context', async (sourceType) => {
  await CREATE(request('http://local/api/tasks', 'POST', { title: 'Follow up', sourceType, sourceTitle: 'Customer thread', sourceSnippet: 'Please follow up today', sourceUrl: 'https://example.com/thread' }))
  expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceType, sourceTitle: 'Customer thread', sourceSnippet: 'Please follow up today', sourceUrl: 'https://example.com/thread' }) }))
})

test('filters GET by workspace, status and category', async () => {
  await GET(request('http://local/api/tasks?status=active&category=work'))
  expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1', status: 'active', category: 'work' }) }))
})

test('filters GET by sourceType', async () => {
  await GET(request('http://local/api/tasks?sourceType=telegram'))
  expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1', sourceType: 'telegram' }) }))
})

test('blocks a task outside the workspace', async () => {
  jest.mocked(prisma.task.findFirst).mockResolvedValue(null)
  expect((await PATCH(request('http://local/api/tasks/task-1', 'PATCH', { title: 'Changed' }), props))?.status).toBe(404)
  expect(prisma.task.update).not.toHaveBeenCalled()
})

test.each([
  ['approve', APPROVE, 'active'], ['decline', DECLINE, 'declined'], ['complete', COMPLETE, 'completed'],
] as const)('%s transitions a suggested task', async (_name, handler, status) => {
  const response = await handler(request('http://local', 'POST'), props)
  expect(response?.status).toBe(200)
  expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status }) }))
})

test('complete sets completedAt', async () => {
  await COMPLETE(request('http://local', 'POST'), props)
  expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completedAt: expect.any(Date) }) }))
})

test('reopen clears completedAt', async () => {
  jest.mocked(prisma.task.findFirst).mockResolvedValue({ ...task, status: 'completed' } as never)
  await REOPEN(request('http://local', 'POST'), props)
  expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'active', completedAt: null }) }))
})
