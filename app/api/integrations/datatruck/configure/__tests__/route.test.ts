/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { encrypt } from '@/lib/crypto'
import { POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/crypto', () => ({ encrypt: jest.fn((value: string) => `encrypted(${value})`) }))
jest.mock('@/lib/db', () => ({
  prisma: {
    apiConnector: { upsert: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockEncrypt = jest.mocked(encrypt)
const mockUpsert = jest.mocked(prisma.apiConnector.upsert)

function request(body: unknown) {
  return POST(new Request('http://localhost/api/integrations/datatruck/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({
    workspaceId: 'workspace-1',
    member: { role: 'admin', status: 'active', displayName: 'Ali' },
  } as never)
  mockUpsert.mockResolvedValue({ id: 'connector-1', status: 'connected' } as never)
})

it('returns 401 when unauthenticated', async () => {
  mockAuth.mockResolvedValue({ userId: null } as never)

  const res = await request({ companyName: 'sflogistics', apiToken: 'secret' })

  expect(res.status).toBe(401)
  expect(mockUpsert).not.toHaveBeenCalled()
})

it('rejects users outside the workspace', async () => {
  mockRequireWorkspaceMember.mockResolvedValue({ error: 'Forbidden', status: 403 } as never)

  const res = await request({ companyName: 'sflogistics', apiToken: 'secret' })

  expect(res.status).toBe(403)
  expect(mockUpsert).not.toHaveBeenCalled()
})

it('rejects a missing company name', async () => {
  const res = await request({ apiToken: 'secret' })

  expect(res.status).toBe(400)
  expect(mockUpsert).not.toHaveBeenCalled()
})

it('rejects a missing API token', async () => {
  const res = await request({ companyName: 'sflogistics' })

  expect(res.status).toBe(400)
  expect(mockUpsert).not.toHaveBeenCalled()
})

it('normalizes a full Datatruck URL to the company name and builds the base URL', async () => {
  const res = await request({ companyName: 'https://SFLogistics.datatruck.io/', apiToken: 'secret' })

  expect(res.status).toBe(200)
  expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { workspaceId_sourceKey: { workspaceId: 'workspace-1', sourceKey: 'datatruck' } },
    create: expect.objectContaining({
      apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi',
      authType: 'api_token',
      status: 'connected',
      metadata: expect.objectContaining({ companyName: 'sflogistics' }),
    }),
  }))
  const json = await res.json()
  expect(json.connector.companyName).toBe('sflogistics')
})

it('stores the encrypted token, never the raw token', async () => {
  await request({ companyName: 'sflogistics', apiToken: 'raw-secret-token' })

  expect(mockEncrypt).toHaveBeenCalledWith('raw-secret-token')
  const upsertArgs = mockUpsert.mock.calls[0][0] as { create: Record<string, unknown>; update: Record<string, unknown> }
  expect(upsertArgs.create.encryptedCredential).toBe('encrypted(raw-secret-token)')
  expect(upsertArgs.update.encryptedCredential).toBe('encrypted(raw-secret-token)')
  expect(JSON.stringify(upsertArgs.create.metadata)).not.toContain('raw-secret-token')
})

it('never returns the token or encrypted credential in the response', async () => {
  const res = await request({ companyName: 'sflogistics', apiToken: 'raw-secret-token' })

  const body = JSON.stringify(await res.json())
  expect(body).not.toContain('raw-secret-token')
  expect(body).not.toContain('encrypted(')
  expect(JSON.parse(body)).toEqual({
    success: true,
    message: 'Datatruck connected.',
    connector: { id: 'connector-1', status: 'connected', companyName: 'sflogistics' },
  })
})
