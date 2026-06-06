/**
 * @jest-environment node
 */
import { GET, PATCH } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    userPreference: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUser = jest.mocked(prisma.user.findUnique)
const mockMember = jest.mocked(prisma.workspaceMember.findUnique)
const mockPrefFind = jest.mocked(prisma.userPreference.findUnique)
const mockPrefUpsert = jest.mocked(prisma.userPreference.upsert)

const WS = 'ws-1'

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'u-1' } as never)
  mockUser.mockResolvedValue({ workspace: { id: WS } } as never)
  mockMember.mockResolvedValue({ role: 'member' } as never)
  mockPrefFind.mockResolvedValue(null)
  mockPrefUpsert.mockResolvedValue({ id: 'pref-1' } as never)
})

function patchReq(body: unknown) {
  return new Request('http://localhost/api/settings/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe('GET /api/settings/preferences', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect((await GET()).status).toBe(401)
  })

  it('returns defaults when no preference row exists', async () => {
    const body = await (await GET()).json()
    expect(body.data.digestEnabled).toBe(true)
    expect(body.data.staleThresholdDays).toBe(30)
  })

  it('returns stored preferences when row exists', async () => {
    mockPrefFind.mockResolvedValue({ digestEnabled: false, staleThresholdDays: 60 } as never)
    const body = await (await GET()).json()
    expect(body.data.digestEnabled).toBe(false)
  })
})

describe('PATCH /api/settings/preferences', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect((await PATCH(patchReq({ digestEnabled: false }))).status).toBe(401)
  })

  it('returns 400 for invalid digestTime', async () => {
    expect((await PATCH(patchReq({ digestTime: 25 }))).status).toBe(400)
  })

  it('upserts on workspaceId + userId', async () => {
    await PATCH(patchReq({ digestEnabled: false }))
    expect(mockPrefUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId_userId: { workspaceId: WS, userId: 'u-1' } } }),
    )
  })
})
