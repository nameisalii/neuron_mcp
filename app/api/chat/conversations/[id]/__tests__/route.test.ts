/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { GET, PATCH } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    chatConversation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockFindFirst = jest.mocked(prisma.chatConversation.findFirst)
const mockUpdate = jest.mocked(prisma.chatConversation.update)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({ workspaceId: 'workspace-1' } as never)
})

it('renames an authorized conversation', async () => {
  mockFindFirst.mockResolvedValue({ id: 'conversation-1' } as never)
  mockUpdate.mockResolvedValue({
    id: 'conversation-1',
    title: 'Renamed chat',
    relatedLoadId: null,
    sourceContext: null,
    createdAt: new Date('2026-07-06T12:00:00.000Z'),
    updatedAt: new Date('2026-07-06T12:10:00.000Z'),
  } as never)

  const res = await PATCH(new Request('http://localhost/api/chat/conversations/conversation-1', {
    method: 'PATCH',
    body: JSON.stringify({ title: ' Renamed chat ' }),
  }), {
    params: Promise.resolve({ id: 'conversation-1' }),
  })

  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'conversation-1' },
    data: { title: 'Renamed chat' },
  }))
  const json = await res.json()
  expect(json.conversation.title).toBe('Renamed chat')
})

it('rejects an empty rename title', async () => {
  const res = await PATCH(new Request('http://localhost/api/chat/conversations/conversation-1', {
    method: 'PATCH',
    body: JSON.stringify({ title: '   ' }),
  }), {
    params: Promise.resolve({ id: 'conversation-1' }),
  })

  expect(res.status).toBe(400)
  expect(mockUpdate).not.toHaveBeenCalled()
})

it('rejects unauthorized rename access', async () => {
  mockFindFirst.mockResolvedValue(null)
  const res = await PATCH(new Request('http://localhost/api/chat/conversations/conversation-2', {
    method: 'PATCH',
    body: JSON.stringify({ title: 'New title' }),
  }), {
    params: Promise.resolve({ id: 'conversation-2' }),
  })

  expect(res.status).toBe(404)
  expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      id: 'conversation-2',
      workspaceId: 'workspace-1',
      userId: 'user-1',
    },
  }))
})

it('rejects access to conversations outside the current workspace/user', async () => {
  mockFindFirst.mockResolvedValue(null)

  const res = await GET(new Request('http://localhost/api/chat/conversations/conversation-2'), {
    params: Promise.resolve({ id: 'conversation-2' }),
  })

  expect(res.status).toBe(404)
  expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      id: 'conversation-2',
      workspaceId: 'workspace-1',
      userId: 'user-1',
    },
  }))
})

it('returns messages ordered for an authorized conversation', async () => {
  mockFindFirst.mockResolvedValue({
    id: 'conversation-1',
    title: 'Telegram knowledge',
    relatedLoadId: null,
    sourceContext: null,
    createdAt: new Date('2026-07-06T12:00:00.000Z'),
    updatedAt: new Date('2026-07-06T12:02:00.000Z'),
    messages: [
      {
        id: 'message-1',
        role: 'user',
        content: 'What does Neuron know about Telegram?',
        createdAt: new Date('2026-07-06T12:00:00.000Z'),
      },
    ],
  } as never)

  const res = await GET(new Request('http://localhost/api/chat/conversations/conversation-1'), {
    params: Promise.resolve({ id: 'conversation-1' }),
  })

  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json.data).toEqual(expect.objectContaining({
    id: 'conversation-1',
    title: 'Telegram knowledge',
    messages: expect.arrayContaining([
      expect.objectContaining({ content: 'What does Neuron know about Telegram?' }),
    ]),
  }))
})
