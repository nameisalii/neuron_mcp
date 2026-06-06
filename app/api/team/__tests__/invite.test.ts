/**
 * @jest-environment node
 */
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    invitation: { findUnique: jest.fn(), update: jest.fn() },
    workspaceMember: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({
      workspaceMember: { upsert: jest.fn() },
      invitation: { update: jest.fn() },
    })),
  },
}))

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn().mockResolvedValue({ userId: 'user-1' }),
  clerkClient: jest.fn().mockResolvedValue({
    users: {
      getUser: jest.fn().mockResolvedValue({
        firstName: 'Ali',
        lastName: 'Z',
        emailAddresses: [{ emailAddress: 'ali@example.com' }],
        imageUrl: null,
      }),
    },
  }),
}))

const mockFindUnique = jest.mocked(prisma.invitation.findUnique)
const mockUpdate = jest.mocked(prisma.invitation.update)
const mockTx = jest.mocked(prisma.$transaction)

describe('invite acceptance', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects expired invite', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'inv-1',
      workspaceId: 'ws-1',
      status: 'pending',
      role: 'member',
      invitedBy: 'owner-1',
      expiresAt: new Date(Date.now() - 1000),
    } as never)

    const { POST } = await import('../invite/[token]/accept/route')
    const req = new Request('http://localhost')
    const res = await POST(req, { params: Promise.resolve({ token: 'abc' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/expired/)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired' } }),
    )
  })

  it('rejects already-accepted invite', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'inv-2',
      status: 'accepted',
      expiresAt: new Date(Date.now() + 100000),
    } as never)

    const { POST } = await import('../invite/[token]/accept/route')
    const req = new Request('http://localhost')
    const res = await POST(req, { params: Promise.resolve({ token: 'xyz' }) })

    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown token', async () => {
    mockFindUnique.mockResolvedValueOnce(null as never)

    const { POST } = await import('../invite/[token]/accept/route')
    const req = new Request('http://localhost')
    const res = await POST(req, { params: Promise.resolve({ token: 'nope' }) })

    expect(res.status).toBe(404)
  })
})
