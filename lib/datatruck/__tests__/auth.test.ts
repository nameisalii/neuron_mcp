/**
 * @jest-environment node
 */
import { prisma } from '@/lib/db'
import { decrypt, encrypt } from '@/lib/crypto'
import {
  completeFullAccountConnection,
  createFullAccountMfaChallenge,
  decodeDatatruckCredentialBundle,
  exchangeForDatatruckToken,
  getValidDatatruckInternalAccessToken,
  initiateDatatruckCognitoLogin,
  lookupDatatruckTenant,
  respondToDatatruckMfaChallenge,
} from '../auth'

jest.mock('@/lib/db', () => ({
  prisma: {
    apiConnector: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  },
}))
jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn((value: string) => `encrypted:${value}`),
  decrypt: jest.fn((value: string) => value.replace(/^encrypted:/, '')),
}))

const mockFetch = jest.fn()
const mockUpsert = jest.mocked(prisma.apiConnector.upsert)
const mockFindUnique = jest.mocked(prisma.apiConnector.findUnique)
const mockUpdate = jest.mocked(prisma.apiConnector.update)
const mockEncrypt = jest.mocked(encrypt)
const mockDecrypt = jest.mocked(decrypt)
const originalFetch = global.fetch

function jwt(expOffsetSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000)
  return [
    Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iat: now, exp: now + expOffsetSeconds, token_use: 'access' })).toString('base64url'),
    'sig',
  ].join('.')
}

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = mockFetch as never
  mockUpsert.mockResolvedValue({} as never)
  mockUpdate.mockResolvedValue({} as never)
})

afterEach(() => {
  global.fetch = originalFetch
})

it('looks up tenant Cognito configuration without returning credentials', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([{
      schema_name: 'sflogistics',
      cognito: { client_id: 'client-1', region: 'us-east-2' },
      force_2fa: false,
      user_2fa_enabled: true,
    }]),
  })

  const tenant = await lookupDatatruckTenant({ usernameOrEmail: 'user@example.com' })

  expect(tenant).toEqual({
    companyName: 'sflogistics',
    cognitoClientId: 'client-1',
    cognitoRegion: 'us-east-2',
    force2fa: false,
    user2faEnabled: true,
  })
  expect(String(mockFetch.mock.calls[0][0])).toContain('tenant-login')
})

it('initiates Cognito login and returns MFA challenge metadata only', async () => {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ schema_name: 'sflogistics', cognito: { client_id: 'client-1' } }]),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 'raw-session-value' }),
    })

  const result = await initiateDatatruckCognitoLogin({
    usernameOrEmail: 'user@example.com',
    password: 'password-value',
  })

  expect(result.status).toBe('mfa_required')
  expect(result.challengeName).toBe('SOFTWARE_TOKEN_MFA')
  expect(JSON.stringify(result)).not.toContain('password-value')
})

it('stores MFA challenge server-side and completes it without exposing the session', async () => {
  const challenge = createFullAccountMfaChallenge({
    workspaceId: 'ws-1',
    userId: 'user-1',
    cognito: {
      status: 'mfa_required',
      challengeName: 'SOFTWARE_TOKEN_MFA',
      session: 'raw-session-value',
      clientId: 'client-1',
      region: 'us-east-2',
      usernameOrEmail: 'user@example.com',
      companyName: 'sflogistics',
    },
  })
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ AuthenticationResult: { AccessToken: jwt(), IdToken: jwt(), RefreshToken: 'refresh-value', ExpiresIn: 3600 } }),
  })

  const result = await respondToDatatruckMfaChallenge({
    challengeId: challenge.challengeId,
    code: '123456',
    workspaceId: 'ws-1',
    userId: 'user-1',
  })

  expect(result.status).toBe('success')
  expect(JSON.stringify(challenge)).not.toContain('raw-session-value')
})

it('exchanges a Cognito token for a Datatruck Bearer credential safely', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ result: { session: jwt() }, expires_at: new Date(Date.now() + 3600_000).toISOString() }),
  })

  const result = await exchangeForDatatruckToken({ companyName: 'sflogistics', cognitoAccessToken: jwt() })

  expect(result.accessToken).toMatch(/\./)
  expect(String(mockFetch.mock.calls[0][0])).toBe('https://sflogistics.datatruck.io/api/v1/auth/authorize/')
  expect(JSON.stringify(mockFetch.mock.calls[0][1])).toContain('Bearer ')
})

it('persists encrypted full-account credentials and no password', async () => {
  const accessToken = jwt()
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ result: { session: accessToken }, expires_at: new Date(Date.now() + 3600_000).toISOString() }),
  })

  await completeFullAccountConnection({
    workspaceId: 'ws-1',
    cognito: {
      status: 'success',
      accessToken: jwt(),
      idToken: jwt(),
      refreshToken: 'refresh-value',
      clientId: 'client-1',
      region: 'us-east-2',
      usernameOrEmail: 'user@example.com',
      companyName: 'sflogistics',
    },
  })

  expect(mockEncrypt).toHaveBeenCalled()
  const upsert = mockUpsert.mock.calls[0][0] as { create: { encryptedCredential: string; authType: string; metadata: unknown } }
  expect(upsert.create.authType).toBe('full_account')
  expect(upsert.create.encryptedCredential).toContain('encrypted:')
  expect(JSON.stringify(upsert.create.metadata)).not.toContain('refresh-value')
  expect(JSON.stringify(upsert.create)).not.toContain('password')
  expect(decodeDatatruckCredentialBundle(upsert.create.encryptedCredential).cognitoRefreshToken).toBe('refresh-value')
})

it('returns cached encrypted access token when it is still valid', async () => {
  const encrypted = `encrypted:${JSON.stringify({
    mode: 'full_account',
    companyName: 'sflogistics',
    cognitoClientId: 'client-1',
    cognitoRegion: 'us-east-2',
    cognitoRefreshToken: 'refresh-value',
    datatruckAccessToken: 'cached-token',
    accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    connectedAt: new Date().toISOString(),
    authVersion: 1,
  })}`
  mockFindUnique.mockResolvedValue({ id: 'conn-1', authType: 'full_account', encryptedCredential: encrypted, metadata: {} } as never)

  await expect(getValidDatatruckInternalAccessToken('ws-1')).resolves.toBe('cached-token')

  expect(mockFetch).not.toHaveBeenCalled()
  expect(mockDecrypt).toHaveBeenCalledWith(encrypted)
})

it('refreshes expired access using Cognito and updates encrypted connector state', async () => {
  const encrypted = `encrypted:${JSON.stringify({
    mode: 'full_account',
    companyName: 'sflogistics',
    cognitoClientId: 'client-1',
    cognitoRegion: 'us-east-2',
    cognitoRefreshToken: 'refresh-value',
    datatruckAccessToken: 'expired-token',
    accessExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    connectedAt: new Date().toISOString(),
    authVersion: 1,
  })}`
  mockFindUnique.mockResolvedValue({ id: 'conn-1', authType: 'full_account', encryptedCredential: encrypted, metadata: {} } as never)
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ AuthenticationResult: { AccessToken: jwt(), IdToken: jwt(), ExpiresIn: 3600 }, ChallengeParameters: {} }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { session: 'next-internal-token' }, expires_at: new Date(Date.now() + 3600_000).toISOString() }),
    })

  await expect(getValidDatatruckInternalAccessToken('ws-1')).resolves.toBe('next-internal-token')

  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'conn-1' },
    data: expect.objectContaining({ encryptedCredential: expect.stringContaining('encrypted:') }),
  }))
})
