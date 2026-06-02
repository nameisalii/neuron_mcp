/**
 * @jest-environment node
 */
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { detectStaleChunks } from '@/lib/alerts/stale-detector'

jest.mock('@/lib/db', () => ({ prisma: { syncStatus: { findMany: jest.fn() } } }))
jest.mock('@/lib/alerts/stale-detector', () => ({ detectStaleChunks: jest.fn() }))

const mockSyncStatuses = jest.mocked(prisma.syncStatus.findMany)
const mockDetect = jest.mocked(detectStaleChunks)

const SECRET = 'cron-secret'
function req(secret?: string) {
  return new Request('http://localhost/api/cron/detect-stale', { headers: { 'x-cron-secret': secret ?? SECRET } }) as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  mockSyncStatuses.mockResolvedValue([])
  mockDetect.mockResolvedValue(0)
})

describe('GET /api/cron/detect-stale', () => {
  it('returns 401 with wrong secret', async () => {
    expect((await GET(req('bad'))).status).toBe(401)
  })

  it('returns 0 alerts when no active workspaces', async () => {
    const body = await (await GET(req())).json()
    expect(body).toEqual({ workspacesChecked: 0, alertsCreated: 0 })
  })

  it('calls detectStaleChunks per workspace and sums alerts', async () => {
    mockSyncStatuses.mockResolvedValue([{ workspaceId: 'ws-1' }, { workspaceId: 'ws-2' }] as never)
    mockDetect.mockResolvedValueOnce(2).mockResolvedValueOnce(1)
    const body = await (await GET(req())).json()
    expect(body).toEqual({ workspacesChecked: 2, alertsCreated: 3 })
  })
})
