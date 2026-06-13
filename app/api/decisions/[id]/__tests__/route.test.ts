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
    knowledgeItem: { findFirst: jest.fn(), update: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockItemFind = jest.mocked(prisma.knowledgeItem.findFirst)
const mockItemUpdate = jest.mocked(prisma.knowledgeItem.update)

const ROUTE_PARAMS = { params: Promise.resolve({ id: 'decision-1' }) }

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/decisions/decision-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mockItem = {
  id: 'decision-1',
  workspaceId: 'ws-1',
  content: 'We will use TypeScript for all new code',
  category: 'decision',
  reason: null,
  alternatives: null,
  source: 'slack',
  owner: null,
  createdAt: new Date(),
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-clerk-1' } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  mockItemFind.mockResolvedValue({ id: 'decision-1' } as never)
  mockItemUpdate.mockResolvedValue({ ...mockItem, reason: 'For type safety' } as never)
})

describe('PATCH /api/decisions/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)

    const res = await PATCH(makeRequest({ reason: 'test' }), ROUTE_PARAMS)

    expect(res.status).toBe(401)
  })

  it('returns 404 when user has no workspace', async () => {
    mockUserFind.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ reason: 'test' }), ROUTE_PARAMS)

    expect(res.status).toBe(404)
  })

  it('returns 404 when decision does not belong to workspace (IDOR guard)', async () => {
    mockItemFind.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ reason: 'test' }), ROUTE_PARAMS)

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Not found')
  })

  it('queries decision with both id and workspaceId to prevent IDOR', async () => {
    await PATCH(makeRequest({ reason: 'test' }), ROUTE_PARAMS)

    expect(mockItemFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'decision-1', workspaceId: 'ws-1', category: 'decision' },
      })
    )
  })

  it('updates reason when provided', async () => {
    await PATCH(makeRequest({ reason: 'For type safety' }), ROUTE_PARAMS)

    expect(mockItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'For type safety' }),
      })
    )
  })

  it('updates alternatives when provided', async () => {
    await PATCH(makeRequest({ alternatives: 'JavaScript, Flow' }), ROUTE_PARAMS)

    expect(mockItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ alternatives: 'JavaScript, Flow' }),
      })
    )
  })

  it('accepts partial updates (only reason without alternatives)', async () => {
    const res = await PATCH(makeRequest({ reason: 'Simplicity' }), ROUTE_PARAMS)

    expect(res.status).toBe(200)
    expect(mockItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reason: 'Simplicity' },
      })
    )
  })

  it('returns 400 when reason exceeds 1000 characters', async () => {
    const res = await PATCH(makeRequest({ reason: 'a'.repeat(1001) }), ROUTE_PARAMS)

    expect(res.status).toBe(400)
  })

  it('returns 400 when alternatives exceeds 500 characters', async () => {
    const res = await PATCH(makeRequest({ alternatives: 'b'.repeat(501) }), ROUTE_PARAMS)

    expect(res.status).toBe(400)
  })

  it('returns updated decision on success', async () => {
    const res = await PATCH(makeRequest({ reason: 'For type safety' }), ROUTE_PARAMS)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe('decision-1')
  })

  it('returns 500 on unexpected DB error', async () => {
    mockItemUpdate.mockRejectedValue(new Error('DB error'))

    const res = await PATCH(makeRequest({ reason: 'test' }), ROUTE_PARAMS)

    expect(res.status).toBe(500)
  })
})
