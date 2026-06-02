/**
 * @jest-environment node
 */
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { runNotionBackgroundSync } from '@/lib/sync/background'

jest.mock('@/lib/db', () => ({
  prisma: {
    syncStatus: { findMany: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/sync/background', () => ({ runNotionBackgroundSync: jest.fn() }))

const mockFindMany = jest.mocked(prisma.syncStatus.findMany)
const mockUpdate = jest.mocked(prisma.syncStatus.update)
const mockSync = jest.mocked(runNotionBackgroundSync)

const SECRET = 'cron-secret-123'

function req(secret?: string) {
  return new Request('http://localhost/api/cron/sync-notion', {
    headers: { 'x-cron-secret': secret ?? SECRET },
  }) as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  mockFindMany.mockResolvedValue([])
  mockSync.mockResolvedValue({ pages: 1, chunks: 3, skipped: 0, failed: [] })
  mockUpdate.mockResolvedValue({} as never)
})

describe('GET /api/cron/sync-notion', () => {
  it('returns 401 with wrong secret', async () => {
    const res = await GET(req('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 401 with missing secret', async () => {
    const res = await GET(new Request('http://localhost/api/cron/sync-notion') as unknown as NextRequest)
    expect(res.status).toBe(401)
  })

  it('returns processed count with no active workspaces', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ processed: 0, total: 0 })
  })

  it('calls runNotionBackgroundSync for each active workspace', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'ss-1', workspaceId: 'ws-1' },
      { id: 'ss-2', workspaceId: 'ws-2' },
    ] as never)
    const res = await GET(req())
    expect(mockSync).toHaveBeenCalledTimes(2)
    const body = await res.json()
    expect(body).toEqual({ processed: 2, total: 2 })
  })

  it('marks workspace as error and continues when sync fails', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'ss-1', workspaceId: 'ws-1' },
      { id: 'ss-2', workspaceId: 'ws-2' },
    ] as never)
    mockSync
      .mockRejectedValueOnce(new Error('Notion API down'))
      .mockResolvedValueOnce({ pages: 1, chunks: 2, skipped: 0, failed: [] })

    const res = await GET(req())
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ss-1' }, data: expect.objectContaining({ status: 'error' }) }),
    )
    const body = await res.json()
    expect(body.processed).toBe(1)
  })

  it('queries only background+active notion sync statuses', async () => {
    await GET(req())
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { integration: 'notion', mode: 'background', status: 'active' } }),
    )
  })
})
