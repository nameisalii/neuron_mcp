/** @jest-environment node */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/granola/api'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    integration: { upsert: jest.fn() },
  },
}))
jest.mock('@/lib/crypto', () => ({ encrypt: (value: string) => `enc(${value})` }))
jest.mock('@/lib/granola/api', () => ({
  verifyToken: jest.fn(),
  GranolaApiError: class extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/integrations/granola/connect', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ workspace: { id: 'ws-1' } })
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ role: 'owner', status: 'active' })
  ;(prisma.integration.upsert as jest.Mock).mockResolvedValue({})
  ;(verifyToken as jest.Mock).mockResolvedValue(true)
})

it('rejects a token without the grn_ prefix and does not store it', async () => {
  const res = await POST(makeRequest({ token: 'not-a-granola-key' }))
  expect(res.status).toBe(400)
  expect(prisma.integration.upsert).not.toHaveBeenCalled()
})

it('stores an encrypted token for a valid key', async () => {
  const res = await POST(makeRequest({ token: 'grn_validkey1234' }))
  expect(res.status).toBe(200)
  expect(verifyToken).toHaveBeenCalledWith('grn_validkey1234')
  const upsertArg = (prisma.integration.upsert as jest.Mock).mock.calls[0][0]
  expect(upsertArg.create.accessToken).toBe('enc(grn_validkey1234)')
  expect(upsertArg.create.type).toBe('granola')
})
