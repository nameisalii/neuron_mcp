/**
 * @jest-environment node
 */
import { GET, POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    captureRule: { findMany: jest.fn(), create: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockRuleFindMany = jest.mocked(prisma.captureRule.findMany)
const mockRuleCreate = jest.mocked(prisma.captureRule.create)

const WS = 'ws-1'
const UID = 'user-1'

function req(body?: unknown) {
  return new Request('http://localhost/api/settings/capture-rules', {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: UID } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: WS } } as never)
  mockMemberFind.mockResolvedValue({ role: 'admin' } as never)
  mockRuleFindMany.mockResolvedValue([])
  mockRuleCreate.mockResolvedValue({ id: 'r1', workspaceId: WS } as never)
})

describe('GET /api/settings/capture-rules', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 for viewer role', async () => {
    mockMemberFind.mockResolvedValue({ role: 'viewer' } as never)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns rules list with meta', async () => {
    mockRuleFindMany.mockResolvedValue([{ id: 'r1' }] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.meta.total).toBe(1)
  })
})

describe('POST /api/settings/capture-rules', () => {
  const validBody = { integration: 'notion', ruleType: 'include', target: 'page-123', targetName: 'Policy Doc' }

  it('returns 403 for member role', async () => {
    mockMemberFind.mockResolvedValue({ role: 'member' } as never)
    const res = await POST(req(validBody))
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid body', async () => {
    const res = await POST(req({ integration: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('creates rule and returns 201', async () => {
    const res = await POST(req(validBody))
    expect(res.status).toBe(201)
    expect(mockRuleCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: WS, createdBy: UID }) }),
    )
  })
})
