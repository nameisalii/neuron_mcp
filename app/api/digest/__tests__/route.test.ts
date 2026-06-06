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
    digest: { findMany: jest.fn(), count: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUser = jest.mocked(prisma.user.findUnique)
const mockMember = jest.mocked(prisma.workspaceMember.findUnique)
const mockFind = jest.mocked(prisma.digest.findMany)
const mockCount = jest.mocked(prisma.digest.count)

const WS = 'ws-1'
function req(params = '') { return new Request(`http://localhost/api/digest${params}`) }

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'u-1' } as never)
  mockUser.mockResolvedValue({ workspace: { id: WS } } as never)
  mockMember.mockResolvedValue({ role: 'member' } as never)
  mockFind.mockResolvedValue([])
  mockCount.mockResolvedValue(0)
})

describe('GET /api/digest', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect((await GET(req())).status).toBe(401)
  })

  it('returns 403 for viewer role', async () => {
    mockMember.mockResolvedValue({ role: 'viewer' } as never)
    expect((await GET(req())).status).toBe(403)
  })

  it('returns paginated digests', async () => {
    mockFind.mockResolvedValue([{ id: 'd1' }] as never)
    mockCount.mockResolvedValue(1)
    const body = await (await GET(req())).json()
    expect(body.data).toHaveLength(1)
    expect(body.meta).toMatchObject({ total: 1, page: 1, limit: 10 })
  })

  it('filters by type when provided', async () => {
    await GET(req('?type=weekly'))
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ type: 'weekly' }) }))
  })

  it('filters unread digests', async () => {
    await GET(req('?unread=true'))
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ readAt: null }) }))
  })
})
