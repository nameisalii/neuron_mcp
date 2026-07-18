/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import {
  completeFullAccountConnection,
  createFullAccountMfaChallenge,
  initiateDatatruckCognitoLogin,
} from '@/lib/datatruck/auth'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/datatruck/auth', () => ({
  isDatatruckFullAccountEnabled: jest.fn(() => process.env.DATATRUCK_FULL_ACCOUNT_CONNECTOR_ENABLED === 'true'),
  initiateDatatruckCognitoLogin: jest.fn(),
  createFullAccountMfaChallenge: jest.fn(),
  completeFullAccountConnection: jest.fn(),
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockInitiate = jest.mocked(initiateDatatruckCognitoLogin)
const mockChallenge = jest.mocked(createFullAccountMfaChallenge)
const mockComplete = jest.mocked(completeFullAccountConnection)

async function post(body: unknown) {
  const { POST } = await import('../route')
  return POST(new Request('http://localhost/api/integrations/datatruck/full-account/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.DATATRUCK_FULL_ACCOUNT_CONNECTOR_ENABLED = 'true'
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({
    workspaceId: 'ws-1',
    member: { displayName: 'Ali', role: 'admin', status: 'active' },
  } as never)
  mockComplete.mockResolvedValue(undefined)
})

afterEach(() => {
  delete process.env.DATATRUCK_FULL_ACCOUNT_CONNECTOR_ENABLED
})

it('rejects full account route when feature flag is disabled', async () => {
  delete process.env.DATATRUCK_FULL_ACCOUNT_CONNECTOR_ENABLED

  const res = await post({ usernameOrEmail: 'user@example.com', password: 'secret' })

  expect(res.status).toBe(404)
  expect(mockInitiate).not.toHaveBeenCalled()
})

it('connects without exposing password or tokens', async () => {
  mockInitiate.mockResolvedValue({
    status: 'success',
    accessToken: 'access-secret',
    idToken: 'id-secret',
    refreshToken: 'refresh-secret',
    clientId: 'client-1',
    region: 'us-east-2',
    usernameOrEmail: 'user@example.com',
    companyName: 'sflogistics',
  } as never)

  const res = await post({ company: 'sflogistics', usernameOrEmail: 'user@example.com', password: 'secret-password' })
  const body = JSON.stringify(await res.json())

  expect(res.status).toBe(200)
  expect(body).toBe(JSON.stringify({ status: 'connected' }))
  expect(body).not.toContain('secret-password')
  expect(body).not.toContain('access-secret')
  expect(body).not.toContain('refresh-secret')
  expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1' }))
})

it('returns opaque MFA challenge only', async () => {
  mockInitiate.mockResolvedValue({
    status: 'mfa_required',
    challengeName: 'SOFTWARE_TOKEN_MFA',
    session: 'raw-session',
    clientId: 'client-1',
    region: 'us-east-2',
    usernameOrEmail: 'user@example.com',
    companyName: 'sflogistics',
  } as never)
  mockChallenge.mockReturnValue({ challengeId: 'opaque-id', challengeType: 'SOFTWARE_TOKEN_MFA' })

  const res = await post({ usernameOrEmail: 'user@example.com', password: 'secret-password' })
  const body = JSON.stringify(await res.json())

  expect(res.status).toBe(200)
  expect(body).toContain('opaque-id')
  expect(body).not.toContain('raw-session')
  expect(body).not.toContain('secret-password')
})
