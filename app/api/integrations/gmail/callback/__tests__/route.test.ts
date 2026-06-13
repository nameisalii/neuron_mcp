/** @jest-environment node */
import { NextRequest } from 'next/server'
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    integration: { upsert: jest.fn() },
    syncStatus: { upsert: jest.fn() },
  },
}))
jest.mock('@/lib/crypto', () => ({ encrypt: jest.fn().mockReturnValue('encrypted_refresh_token') }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockCookies = jest.mocked(cookies)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockIntegrationUpsert = jest.mocked(prisma.integration.upsert)

function makeRequest(query: Record<string, string>) {
  const url = new URL('http://localhost/api/integrations/gmail/callback')
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return new NextRequest(url)
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GOOGLE_CLIENT_ID = 'google-cid'
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret'
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockCookies.mockReturnValue({
    get: jest.fn().mockReturnValue({ value: 'state.user-1' }),
    delete: jest.fn(),
  } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  mockMemberFind.mockResolvedValue({ role: 'member', displayName: 'Ali', status: 'active' } as never)
  mockIntegrationUpsert.mockResolvedValue({} as never)
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ access_token: 'access-token', refresh_token: 'refresh-token' }),
  }) as never
})

it('stores the encrypted refresh token and redirects to Gmail setup', async () => {
  const res = await GET(makeRequest({ code: 'code', state: 'state.user-1' }))
  expect(res.status).toBe(307)
  expect(res.headers.get('location')).toContain('connected=gmail')
  expect(mockIntegrationUpsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { workspaceId_type: { workspaceId: 'ws-1', type: 'gmail' } },
    update: expect.objectContaining({
      accessToken: 'encrypted_refresh_token',
      metadata: expect.objectContaining({ selectedLabels: ['INBOX', 'SENT'] }),
    }),
  }))
  expect(encrypt).toHaveBeenCalledWith('refresh-token')
})

it('rejects missing refresh tokens', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'access-token' }),
  })
  const res = await GET(makeRequest({ code: 'code', state: 'state.user-1' }))
  expect(res.headers.get('location')).toContain('error=gmail_failed')
  expect(res.headers.get('location')).toContain('reason=missing_refresh_token')
})

it('rejects invalid state cookies', async () => {
  const res = await GET(makeRequest({ code: 'code', state: 'wrong' }))
  expect(res.headers.get('location')).toContain('reason=invalid_state')
})
