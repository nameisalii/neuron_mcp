/**
 * @jest-environment node
 */
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { generateDailyDigest } from '@/lib/digest/generate'

jest.mock('@/lib/db', () => ({
  prisma: {
    workspaceMember: { findMany: jest.fn() },
    userPreference: { findUnique: jest.fn() },
    digest: { create: jest.fn() },
    user: { findFirst: jest.fn() },
  },
}))
jest.mock('@/lib/digest/generate', () => ({ generateDailyDigest: jest.fn() }))
jest.mock('@/lib/digest/email', () => ({ renderDigestEmail: jest.fn().mockReturnValue('<html>') }))
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: jest.fn() } })) }))

const mockMembers = jest.mocked(prisma.workspaceMember.findMany)
const mockPref = jest.mocked(prisma.userPreference.findUnique)
const mockDigestCreate = jest.mocked(prisma.digest.create)
const mockGenerate = jest.mocked(generateDailyDigest)

const SECRET = 'cron-secret'

function req(secret?: string) {
  return new Request('http://localhost/api/cron/daily-digest', {
    headers: { 'x-cron-secret': secret ?? SECRET },
  }) as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  mockMembers.mockResolvedValue([])
  mockPref.mockResolvedValue(null)
  mockDigestCreate.mockResolvedValue({} as never)
  mockGenerate.mockResolvedValue({ summary: 'Good day', highlights: [], stats: { synced: 1, labeled: 0, queries: 0, alerts: 0 } })
})

describe('GET /api/cron/daily-digest', () => {
  it('returns 401 with wrong secret', async () => {
    const res = await GET(req('bad'))
    expect(res.status).toBe(401)
  })

  it('returns processed=0 when no members', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body).toEqual({ processed: 0, total: 0 })
  })

  it('generates and stores digest for each active member', async () => {
    mockMembers.mockResolvedValue([{ workspaceId: 'ws-1', userId: 'u-1', displayName: 'Ali' }] as never)
    const res = await GET(req())
    expect(mockGenerate).toHaveBeenCalledWith('ws-1', 'u-1', expect.any(Object))
    expect(mockDigestCreate).toHaveBeenCalled()
    const body = await res.json()
    expect(body.processed).toBe(1)
  })

  it('skips member when digestEnabled is false', async () => {
    mockMembers.mockResolvedValue([{ workspaceId: 'ws-1', userId: 'u-1', displayName: 'Ali' }] as never)
    mockPref.mockResolvedValue({ digestEnabled: false, emailDigest: false, focusAreas: [], staleThresholdDays: 30 } as never)
    await GET(req())
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('continues processing other members when one fails', async () => {
    mockMembers.mockResolvedValue([
      { workspaceId: 'ws-1', userId: 'u-1', displayName: 'Ali' },
      { workspaceId: 'ws-2', userId: 'u-2', displayName: 'Bob' },
    ] as never)
    mockGenerate.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce({ summary: '', highlights: [], stats: { synced: 0, labeled: 0, queries: 0, alerts: 0 } })
    const res = await GET(req())
    const body = await res.json()
    expect(body.processed).toBe(1)
  })
})
