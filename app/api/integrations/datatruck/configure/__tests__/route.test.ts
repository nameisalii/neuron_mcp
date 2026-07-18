/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { encrypt } from '@/lib/crypto'
import { PATCH, POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/crypto', () => ({ encrypt: jest.fn((value: string) => `encrypted(${value})`) }))
jest.mock('@/lib/db', () => ({
  prisma: {
    apiConnector: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockEncrypt = jest.mocked(encrypt)
const mockFindUnique = jest.mocked(prisma.apiConnector.findUnique)
const mockUpdate = jest.mocked(prisma.apiConnector.update)
const mockUpsert = jest.mocked(prisma.apiConnector.upsert)

function request(body: unknown) {
  return POST(new Request('http://localhost/api/integrations/datatruck/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

function patchRequest(body: unknown) {
  return PATCH(new Request('http://localhost/api/integrations/datatruck/configure', {
    method: 'PATCH',
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
  mockFindUnique.mockResolvedValue({ id: 'connector-1', metadata: { companyName: 'sflogistics' } } as never)
  mockUpdate.mockResolvedValue({} as never)
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
  const res = await request({ companyName: 'https://SFLogistics.datatruck.io/settings/tokens', apiToken: 'secret' })

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

it('rejects an unsafe normalized company name', async () => {
  const res = await request({ companyName: '-bad-company', apiToken: 'secret' })

  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({
    error: 'Enter a valid Datatruck company name using lowercase letters, numbers, and hyphens.',
  })
  expect(mockUpsert).not.toHaveBeenCalled()
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

it('saves endpoint mapping in connector metadata without accepting unknown keys', async () => {
  const res = await patchRequest({
    endpointMapping: {
      invoices: 'confirmed/path/',
      customers: '/confirmed/customers/',
      unknown: '/do-not-store/',
    },
  })

  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'connector-1' },
    data: {
      metadata: {
        companyName: 'sflogistics',
        endpointMapping: {
          invoices: '/confirmed/path/',
          customers: '/confirmed/customers/',
        },
      },
    },
  }))
  const body = JSON.stringify(await res.json())
  expect(body).not.toContain('do-not-store')
  expect(body).not.toContain('secret')
})

it('ignores empty endpoint strings and preserves existing default metadata', async () => {
  mockFindUnique.mockResolvedValue({
    id: 'connector-1',
    metadata: {
      companyName: 'sflogistics',
      endpoints: {
        loads: '/orders/',
        drivers: '/drivers/list/',
      },
    },
  } as never)

  const res = await patchRequest({
    endpointMapping: {
      invoices: '   ',
      fuel: '',
      customers: 'confirmed/customers/',
    },
  })

  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    data: {
      metadata: {
        companyName: 'sflogistics',
        endpoints: {
          loads: '/orders/',
          drivers: '/drivers/list/',
        },
        endpointMapping: {
          customers: '/confirmed/customers/',
        },
      },
    },
  }))
})
