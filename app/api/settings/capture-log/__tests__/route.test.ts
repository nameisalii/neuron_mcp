/**
 * @jest-environment node
 */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    captureLog: { count: jest.fn(), findMany: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockCount = jest.mocked(prisma.captureLog.count)
const mockFindMany = jest.mocked(prisma.captureLog.findMany)

const WS = 'ws-1'

function req(params = '') {
  return new Request(`http://localhost/api/settings/capture-log${params}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: WS } } as never)
  mockMemberFind.mockResolvedValue({ role: 'member' } as never)
  mockCount.mockResolvedValue(2)
  mockFindMany.mockResolvedValue([{ id: 'log-1' }, { id: 'log-2' }] as never)
})

describe('GET /api/settings/capture-log', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 403 for viewer role', async () => {
    mockMemberFind.mockResolvedValue({ role: 'viewer' } as never)
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('returns paginated results with meta', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.meta).toMatchObject({ total: 2, page: 1, limit: 20 })
  })

  it('applies status filter', async () => {
    await GET(req('?status=captured'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'captured' }) }),
    )
  })

  it('applies source filter', async () => {
    await GET(req('?source=slack'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ source: 'slack' }) }),
    )
  })

  it('respects page and limit params', async () => {
    await GET(req('?page=2&limit=5'))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    )
  })
})
