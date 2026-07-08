/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { GET, POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    chatConversation: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockFindMany = jest.mocked(prisma.chatConversation.findMany)
const mockCreate = jest.mocked(prisma.chatConversation.create)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({ workspaceId: 'workspace-1' } as never)
})

it('returns only current workspace/user conversations with previews', async () => {
  mockFindMany.mockResolvedValue([
    {
      id: 'conversation-1',
      title: 'BOL for Load 12345',
      relatedLoadId: '12345',
      sourceContext: null,
      createdAt: new Date('2026-07-06T12:00:00.000Z'),
      updatedAt: new Date('2026-07-06T12:05:00.000Z'),
      messages: [{ role: 'user', content: 'Find BOL for load 12345', createdAt: new Date('2026-07-06T12:04:00.000Z') }],
      _count: { messages: 2 },
    },
  ] as never)

  const res = await GET(new Request('http://localhost/api/chat/conversations'))
  expect(res.status).toBe(200)
  expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      workspaceId: 'workspace-1',
      userId: 'user-1',
    }),
  }))
  const json = await res.json()
  expect(json.conversations).toEqual([
    expect.objectContaining({
      id: 'conversation-1',
      title: 'BOL for Load 12345',
      preview: 'Find BOL for load 12345',
      relatedLoadId: '12345',
      messageCount: 2,
    }),
  ])
})

it('returns an empty conversation list without error', async () => {
  mockFindMany.mockResolvedValue([] as never)

  const res = await GET(new Request('http://localhost/api/chat/conversations'))
  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ success: true, conversations: [], data: [] })
})

it('creates a conversation with an automatic load-related title', async () => {
  mockCreate.mockResolvedValue({
    id: 'conversation-1',
    title: 'BOL for Load 12345',
    relatedLoadId: '12345',
    createdAt: new Date('2026-07-06T12:00:00.000Z'),
    updatedAt: new Date('2026-07-06T12:00:00.000Z'),
  } as never)

  const res = await POST(new Request('http://localhost/api/chat/conversations', {
    method: 'POST',
    body: JSON.stringify({ title: 'Find BOL for load 12345' }),
  }))

  expect(res.status).toBe(201)
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      title: 'BOL for Load 12345',
      relatedLoadId: '12345',
    }),
  }))
})
