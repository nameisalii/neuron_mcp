/** @jest-environment node */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
  },
}))

it('returns a safe error if Teams env vars are missing', async () => {
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  delete process.env.MICROSOFT_CLIENT_ID
  delete process.env.MICROSOFT_CLIENT_SECRET

  const res = await GET()
  const body = await res.json()

  expect(res.status).toBe(500)
  expect(body.error).toMatch(/not configured/i)
})
