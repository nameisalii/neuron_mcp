/**
 * @jest-environment node
 */
import { PATCH } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    syncStatus: { upsert: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockUpsert = jest.mocked(prisma.syncStatus.upsert)

const WS = 'ws-1'
const UID = 'user-1'

function req(body: unknown) {
  return new Request('http://localhost/api/settings/sync-status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: UID } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: WS } } as never)
  mockMemberFind.mockResolvedValue({ role: 'admin' } as never)
  mockUpsert.mockResolvedValue({ id: 'ss-1' } as never)
})

describe('PATCH /api/settings/sync-status', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await PATCH(req({ integration: 'notion', status: 'paused' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for member role', async () => {
    mockMemberFind.mockResolvedValue({ role: 'member' } as never)
    const res = await PATCH(req({ integration: 'notion', status: 'paused' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid integration', async () => {
    const res = await PATCH(req({ integration: 'github' }))
    expect(res.status).toBe(400)
  })

  it('upserts on correct unique key', async () => {
    await PATCH(req({ integration: 'slack', mode: 'background' }))
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_integration: { workspaceId: WS, integration: 'slack' } },
      }),
    )
  })

  it('stores configuredBy userId', async () => {
    await PATCH(req({ integration: 'notion', status: 'active' }))
    const call = mockUpsert.mock.calls[0][0]
    expect(call.update).toMatchObject({ configuredBy: UID })
  })

  it('sets nextSyncAt when switching to background mode', async () => {
    await PATCH(req({ integration: 'notion', mode: 'background' }))
    const call = mockUpsert.mock.calls[0][0]
    expect(call.update).toMatchObject(expect.objectContaining({ nextSyncAt: expect.any(Date) }))
  })
})
