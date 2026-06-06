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
    alert: { findMany: jest.fn(), count: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUser = jest.mocked(prisma.user.findUnique)
const mockMember = jest.mocked(prisma.workspaceMember.findUnique)
const mockFind = jest.mocked(prisma.alert.findMany)
const mockCount = jest.mocked(prisma.alert.count)

function req(params = '') { return new Request(`http://localhost/api/alerts${params}`) }

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'u-1' } as never)
  mockUser.mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  mockMember.mockResolvedValue({ role: 'member' } as never)
  mockFind.mockResolvedValue([])
  mockCount.mockResolvedValue(0)
})

describe('GET /api/alerts', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect((await GET(req())).status).toBe(401)
  })

  it('returns 403 for viewer', async () => {
    mockMember.mockResolvedValue({ role: 'viewer' } as never)
    expect((await GET(req())).status).toBe(403)
  })

  it('returns paginated alerts', async () => {
    mockFind.mockResolvedValue([{ id: 'a1' }] as never)
    mockCount.mockResolvedValue(1)
    const body = await (await GET(req())).json()
    expect(body.data).toHaveLength(1)
    expect(body.meta.total).toBe(1)
  })

  it('filters by type and status', async () => {
    await GET(req('?type=conflict&status=unread'))
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'conflict', status: 'unread' }) }),
    )
  })
})
