/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { prisma } from '@/lib/db'
import { POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/db', () => ({ prisma: { apiConnector: { findUnique: jest.fn() } } }))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn(() => 'secret-token') }))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockFindConnector = jest.mocked(prisma.apiConnector.findUnique)

const originalFetch = global.fetch

function request(body: unknown) {
  return POST(new Request('http://localhost/api/integrations/datatruck/test-endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

function mockDatatruckResponse(status: number, body: unknown, contentType = 'application/json') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  global.fetch = jest.fn().mockResolvedValue(new Response(payload, {
    status,
    headers: { 'content-type': contentType },
  })) as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({
    workspaceId: 'workspace-1',
    member: { role: 'member', status: 'active', displayName: 'Ali' },
  } as never)
  mockFindConnector.mockResolvedValue({
    apiBaseUrl: 'https://acme.datatruck.io/api/v1/openapi',
    encryptedCredential: 'encrypted',
  } as never)
})

afterEach(() => {
  global.fetch = originalFetch
})

it('requires authentication', async () => {
  mockAuth.mockResolvedValue({ userId: null } as never)

  const res = await request({ path: '/invoices/' })

  expect(res.status).toBe(401)
})

it('rejects non-Datatruck full URLs', async () => {
  const res = await request({ path: 'https://evil.com/api/' })

  expect(res.status).toBe(400)
  expect((await res.json()).error).toContain('datatruck.io')
})

it('rejects plain HTTP URLs', async () => {
  const res = await request({ path: 'http://acme.datatruck.io/api/' })

  expect(res.status).toBe(400)
  expect((await res.json()).error).toContain('HTTPS')
})

it('rejects localhost and private addresses', async () => {
  for (const target of ['https://localhost/x', 'https://127.0.0.1/x', 'https://192.168.0.1/x']) {
    const res = await request({ path: target })
    expect(res.status).toBe(400)
  }
})

it('tests a relative endpoint and reports the detected shape without exposing the token', async () => {
  mockDatatruckResponse(200, { count: 2, next: null, results: [{ id: 1, status: 'paid', total: '100' }] })

  const res = await request({ path: 'invoices/list/' })
  const body = await res.json()

  expect(res.status).toBe(200)
  expect(body.success).toBe(true)
  expect(body.httpStatus).toBe(200)
  expect(body.shape).toBe('results')
  expect(body.recordCount).toBe(1)
  expect(body.fieldNames).toEqual(['id', 'status', 'total'])
  expect(body.pagination.detected).toBe(true)
  expect(body.authAccepted).toBe(true)
  expect(JSON.stringify(body)).not.toContain('secret-token')
  expect(JSON.stringify(body)).not.toContain('Authorization')

  const fetchCall = jest.mocked(global.fetch).mock.calls[0]
  expect(String(fetchCall[0])).toBe('https://acme.datatruck.io/api/v1/openapi/invoices/list/')
})

it('tests a full Datatruck URL', async () => {
  mockDatatruckResponse(200, [{ id: 9 }])

  const res = await request({ path: 'https://acme.datatruck.io/api/v2/customers/' })
  const body = await res.json()

  expect(body.success).toBe(true)
  expect(body.shape).toBe('array')
  expect(String(jest.mocked(global.fetch).mock.calls[0][0])).toBe('https://acme.datatruck.io/api/v2/customers/')
})

it('reports auth rejection for 401 responses', async () => {
  mockDatatruckResponse(401, { detail: 'invalid token' })

  const res = await request({ path: '/invoices/' })
  const body = await res.json()

  expect(res.status).toBe(502)
  expect(body.success).toBe(false)
  expect(body.authAccepted).toBe(false)
  expect(body.error).toContain('rejected the API token')
})

it('gives a friendly message for 404', async () => {
  mockDatatruckResponse(404, { detail: 'not found' })

  const res = await request({ path: '/nope/' })
  const body = await res.json()

  expect(body.error).toContain('not found in Datatruck')
})

it('explains when the URL returns HTML instead of JSON', async () => {
  mockDatatruckResponse(200, '<!doctype html><html></html>', 'text/html')

  const res = await request({ path: 'https://acme.datatruck.io/settings/mc-numbers/general' })
  const body = await res.json()

  expect(body.success).toBe(false)
  expect(body.error).toContain('not JSON')
})
