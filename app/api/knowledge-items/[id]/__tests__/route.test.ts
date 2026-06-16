/**
 * @jest-environment node
 */
import { PATCH } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    knowledgeItem: { findFirst: jest.fn(), update: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockItemFind = jest.mocked(prisma.knowledgeItem.findFirst)
const mockItemUpdate = jest.mocked(prisma.knowledgeItem.update)

function request(body: unknown) {
  return new Request('http://localhost/api/knowledge-items/item-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function props(id = 'item-1') {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'clerk-1' } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  mockMemberFind.mockResolvedValue({ role: 'member', status: 'active' } as never)
  mockItemFind.mockResolvedValue({ id: 'item-1', category: 'rule', aiSuggestedCategory: 'rule' } as never)
  mockItemUpdate.mockResolvedValue({
    id: 'item-1',
    category: 'process',
    aiSuggestedCategory: 'rule',
    typeOverriddenByUser: true,
    typeOverriddenAt: new Date('2026-06-16T00:00:00.000Z'),
    typeOverriddenByUserId: 'clerk-1',
    updatedAt: new Date('2026-06-16T00:00:00.000Z'),
  } as never)
})

describe('PATCH /api/knowledge-items/[id]', () => {
  it('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)

    const res = await PATCH(request({ type: 'PROCESS' }), props())

    expect(res.status).toBe(401)
  })

  it('rejects invalid type values', async () => {
    const res = await PATCH(request({ type: 'BANANA' }), props())

    expect(res.status).toBe(400)
    expect(mockItemUpdate).not.toHaveBeenCalled()
  })

  it('rejects changing items from another workspace', async () => {
    mockItemFind.mockResolvedValue(null)

    const res = await PATCH(request({ type: 'PROCESS' }), props('other-item'))

    expect(res.status).toBe(404)
  })

  it('updates category and manual override metadata', async () => {
    const res = await PATCH(request({ type: 'PROCESS' }), props())

    expect(res.status).toBe(200)
    expect(mockItemFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'item-1', workspaceId: 'ws-1' },
    }))
    expect(mockItemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'item-1' },
      data: expect.objectContaining({
        category: 'process',
        aiSuggestedCategory: 'rule',
        typeOverriddenByUser: true,
        typeOverriddenAt: expect.any(Date),
        typeOverriddenByUserId: 'clerk-1',
      }),
    }))
    expect(await res.json()).toMatchObject({ id: 'item-1', category: 'process', typeOverriddenByUser: true })
  })

  it('resets to stored AI suggestion', async () => {
    mockItemUpdate.mockResolvedValue({
      id: 'item-1',
      category: 'rule',
      aiSuggestedCategory: 'rule',
      typeOverriddenByUser: false,
      typeOverriddenAt: null,
      typeOverriddenByUserId: null,
      updatedAt: new Date(),
    } as never)

    const res = await PATCH(request({ resetToAiSuggestion: true }), props())

    expect(res.status).toBe(200)
    expect(mockItemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        category: 'rule',
        typeOverriddenByUser: false,
        typeOverriddenAt: null,
        typeOverriddenByUserId: null,
      }),
    }))
  })
})
