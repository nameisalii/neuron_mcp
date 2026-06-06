/**
 * @jest-environment node
 */
import { DELETE } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    captureRule: { findUnique: jest.fn(), delete: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockRuleFind = jest.mocked(prisma.captureRule.findUnique)
const mockRuleDelete = jest.mocked(prisma.captureRule.delete)

const WS = 'ws-1'

function req() {
  return new Request('http://localhost/api/settings/capture-rules/r1', { method: 'DELETE' })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: WS } } as never)
  mockMemberFind.mockResolvedValue({ role: 'admin' } as never)
  mockRuleFind.mockResolvedValue({ id: 'r1', workspaceId: WS } as never)
  mockRuleDelete.mockResolvedValue({} as never)
})

describe('DELETE /api/settings/capture-rules/[ruleId]', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await DELETE(req(), { params: { ruleId: 'r1' } })
    expect(res.status).toBe(401)
  })

  it('returns 403 for member role', async () => {
    mockMemberFind.mockResolvedValue({ role: 'member' } as never)
    const res = await DELETE(req(), { params: { ruleId: 'r1' } })
    expect(res.status).toBe(403)
  })

  it('returns 404 when rule not found', async () => {
    mockRuleFind.mockResolvedValue(null)
    const res = await DELETE(req(), { params: { ruleId: 'r1' } })
    expect(res.status).toBe(404)
  })

  it('returns 404 when rule belongs to different workspace', async () => {
    mockRuleFind.mockResolvedValue({ id: 'r1', workspaceId: 'other-ws' } as never)
    const res = await DELETE(req(), { params: { ruleId: 'r1' } })
    expect(res.status).toBe(404)
  })

  it('deletes and returns success', async () => {
    const res = await DELETE(req(), { params: { ruleId: 'r1' } })
    expect(res.status).toBe(200)
    expect(mockRuleDelete).toHaveBeenCalledWith({ where: { id: 'r1' } })
  })
})
