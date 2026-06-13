/**
 * @jest-environment node
 */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: { digest: { findUnique: jest.fn(), update: jest.fn() } },
}))

const mockAuth = jest.mocked(auth)
const mockFind = jest.mocked(prisma.digest.findUnique)
const mockUpdate = jest.mocked(prisma.digest.update)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'u-1' } as never)
  mockFind.mockResolvedValue({ id: 'd1', userId: 'u-1', readAt: null } as never)
  mockUpdate.mockResolvedValue({ id: 'd1', userId: 'u-1' } as never)
})

function req() { return new Request('http://localhost/api/digest/d1') }

describe('GET /api/digest/[digestId]', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect((await GET(req(), { params: Promise.resolve({ digestId: 'd1' }) })).status).toBe(401)
  })

  it('returns 404 when digest belongs to another user', async () => {
    mockFind.mockResolvedValue({ id: 'd1', userId: 'other' } as never)
    expect((await GET(req(), { params: Promise.resolve({ digestId: 'd1' }) })).status).toBe(404)
  })

  it('marks digest as read on first access', async () => {
    await GET(req(), { params: Promise.resolve({ digestId: 'd1' }) })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'd1' }, data: { readAt: expect.any(Date) } }))
  })

  it('does not update readAt if already read', async () => {
    mockFind.mockResolvedValue({ id: 'd1', userId: 'u-1', readAt: new Date() } as never)
    await GET(req(), { params: Promise.resolve({ digestId: 'd1' }) })
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
