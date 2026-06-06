/**
 * @jest-environment node
 */
import { PATCH } from '../route'
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
  mockFind.mockResolvedValue({ id: 'd1', userId: 'u-1' } as never)
  mockUpdate.mockResolvedValue({ id: 'd1' } as never)
})

function req() { return new Request('http://localhost/api/digest/d1/read', { method: 'PATCH' }) }

describe('PATCH /api/digest/[digestId]/read', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect((await PATCH(req(), { params: { digestId: 'd1' } })).status).toBe(401)
  })

  it('returns 404 for another user digest', async () => {
    mockFind.mockResolvedValue({ id: 'd1', userId: 'other' } as never)
    expect((await PATCH(req(), { params: { digestId: 'd1' } })).status).toBe(404)
  })

  it('sets readAt and returns updated digest', async () => {
    const res = await PATCH(req(), { params: { digestId: 'd1' } })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { readAt: expect.any(Date) } }))
  })
})
