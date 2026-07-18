/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { decrypt } from '@/lib/crypto'
import { GET } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    apiConnector: { findUnique: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockDecrypt = jest.mocked(decrypt)
const mockFindUnique = jest.mocked(prisma.apiConnector.findUnique)
const originalFetch = global.fetch
const originalNodeEnv = process.env.NODE_ENV

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true })
}

beforeEach(() => {
  jest.clearAllMocks()
  setNodeEnv('development')
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({
    workspaceId: 'workspace-1',
    member: { role: 'admin', status: 'active', displayName: 'Ali' },
  } as never)
  mockFindUnique.mockResolvedValue({
    apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi',
    encryptedCredential: 'ciphertext',
    metadata: {},
  } as never)
  mockDecrypt.mockReturnValue('secret-token')
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      count: 1,
      next: null,
      results: [{ id: 'load-1', status: 'open', customer: { id: 'cust-1', name: 'Acme' } }],
    }),
  }) as never
})

afterEach(() => {
  global.fetch = originalFetch
  setNodeEnv(originalNodeEnv)
})

it('is disabled outside development', async () => {
  setNodeEnv('production')

  const res = await GET(new Request('http://localhost/api/integrations/datatruck/debug-shape'))

  expect(res.status).toBe(404)
  expect(global.fetch).not.toHaveBeenCalled()
})

it('returns safe shape only and does not expose the token or raw record', async () => {
  const res = await GET(new Request('http://localhost/api/integrations/datatruck/debug-shape?endpointKey=loads'))

  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json.shape).toEqual(expect.objectContaining({
    status: 200,
    topLevelKeys: ['count', 'next', 'results'],
    resultCount: 1,
    firstResultKeys: ['id', 'status', 'customer'],
    paginated: true,
    nextExists: false,
  }))
  expect(json.shape.nestedKeys.customer).toEqual(['id', 'name'])
  const body = JSON.stringify(json)
  expect(body).not.toContain('secret-token')
  expect(body).not.toContain('Acme')
})
