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
    json: async () => ({ access_token: 'access-token', refresh_token: 'refresh-token', scope: 'https://www.googleapis.com/auth/gmail.readonly' }),
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

it('rejects a token response that did not grant gmail.readonly', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ refresh_token: 'refresh-token', scope: 'openid email' }),
  })
  const res = await GET(makeRequest({ code: 'code', state: 'state.user-1' }))
  expect(res.headers.get('location')).toContain('reason=insufficient_scope')
  expect(mockIntegrationUpsert).not.toHaveBeenCalled()
})

it('rejects invalid state cookies', async () => {
  const res = await GET(makeRequest({ code: 'code', state: 'wrong' }))
  expect(res.headers.get('location')).toContain('reason=invalid_state')
})

describe('actionable OAuth failures', () => {
  it.each([
    ['redirect_uri_mismatch'],
    ['invalid_client'],
    ['invalid_grant'],
    ['invalid_scope'],
  ])('surfaces %s from the token exchange instead of a generic failure', async (googleError) => {
    // Arrange — Google rejects the token exchange with a specific error code
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: googleError, error_description: 'ignored' }),
    })

    // Act
    const res = await GET(makeRequest({ code: 'code', state: 'state.user-1' }))

    // Assert
    const location = res.headers.get('location')!
    expect(location).toContain('error=gmail_failed')
    expect(location).toContain(`reason=${googleError}`)
  })

  it('maps a Workspace admin block to org_internal', async () => {
    const res = await GET(makeRequest({ state: 'state.user-1', error: 'admin_policy_enforced' }))
    expect(res.headers.get('location')).toContain('reason=org_internal')
  })

  it('handles the user cancelling consent', async () => {
    const res = await GET(makeRequest({ state: 'state.user-1', error: 'access_denied' }))
    expect(res.headers.get('location')).toContain('reason=access_denied')
  })

  it('collapses an unrecognized provider error to a generic reason', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'something_new_from_google' }),
    })
    const res = await GET(makeRequest({ code: 'code', state: 'state.user-1' }))
    const location = res.headers.get('location')!
    expect(location).toContain('reason=token_exchange_failed')
    expect(location).not.toContain('something_new_from_google')
  })

  it('still fails cleanly when the error body is not JSON', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new Error('not json') },
    })
    const res = await GET(makeRequest({ code: 'code', state: 'state.user-1' }))
    expect(res.headers.get('location')).toContain('reason=token_exchange_failed')
  })

  it('never leaks the authorization code, tokens, or the client secret', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    process.env.GOOGLE_OAUTH_DEBUG_SAFE = 'true'
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'redirect_uri_mismatch' }),
    })

    const res = await GET(makeRequest({ code: 'super-secret-code', state: 'state.user-1' }))

    const logged = [...infoSpy.mock.calls, ...errorSpy.mock.calls].map((call) => JSON.stringify(call)).join(' ')
    expect(logged).not.toContain('super-secret-code')
    expect(logged).not.toContain('google-secret')
    expect(logged).not.toContain('refresh-token')
    expect(res.headers.get('location')).not.toContain('super-secret-code')

    delete process.env.GOOGLE_OAUTH_DEBUG_SAFE
    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
