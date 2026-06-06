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
    alert: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUser = jest.mocked(prisma.user.findUnique)
const mockMember = jest.mocked(prisma.workspaceMember.findUnique)
const mockFind = jest.mocked(prisma.alert.findUnique)
const mockUpdate = jest.mocked(prisma.alert.update)

const WS = 'ws-1'
function req(body: unknown) {
  return new Request('http://localhost/api/alerts/a1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'u-1' } as never)
  mockUser.mockResolvedValue({ workspace: { id: WS } } as never)
  mockMember.mockResolvedValue({ role: 'member' } as never)
  mockFind.mockResolvedValue({ id: 'a1', workspaceId: WS } as never)
  mockUpdate.mockResolvedValue({ id: 'a1' } as never)
})

describe('PATCH /api/alerts/[alertId]', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect((await PATCH(req({ status: 'read' }), { params: { alertId: 'a1' } })).status).toBe(401)
  })

  it('returns 404 when alert not in workspace', async () => {
    mockFind.mockResolvedValue({ id: 'a1', workspaceId: 'other' } as never)
    expect((await PATCH(req({ status: 'read' }), { params: { alertId: 'a1' } })).status).toBe(404)
  })

  it('marks alert as read', async () => {
    const res = await PATCH(req({ status: 'read' }), { params: { alertId: 'a1' } })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'read' }) }))
  })

  it('stores resolvedBy when resolved', async () => {
    await PATCH(req({ status: 'resolved' }), { params: { alertId: 'a1' } })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolvedBy: 'u-1', resolvedAt: expect.any(Date) }) }),
    )
  })

  it('returns 400 for invalid status', async () => {
    expect((await PATCH(req({ status: 'deleted' }), { params: { alertId: 'a1' } })).status).toBe(400)
  })
})
