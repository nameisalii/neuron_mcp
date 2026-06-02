/**
 * @jest-environment node
 */
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { detectConflicts } from '@/lib/alerts/conflict-detector'

jest.mock('@/lib/db', () => ({
  prisma: { notionChunk: { findMany: jest.fn() }, alert: { count: jest.fn() } },
}))
jest.mock('@/lib/alerts/conflict-detector', () => ({ detectConflicts: jest.fn() }))

const mockChunks = jest.mocked(prisma.notionChunk.findMany)
const mockAlertCount = jest.mocked(prisma.alert.count)
const mockDetect = jest.mocked(detectConflicts)

const SECRET = 'cron-secret'
function req(secret?: string) {
  return new Request('http://localhost/api/cron/detect-conflicts', { headers: { 'x-cron-secret': secret ?? SECRET } }) as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  mockChunks.mockResolvedValue([])
  mockAlertCount.mockResolvedValue(0)
  mockDetect.mockResolvedValue(undefined)
})

describe('GET /api/cron/detect-conflicts', () => {
  it('returns 401 with wrong secret', async () => {
    const res = await GET(req('bad'))
    expect(res.status).toBe(401)
  })

  it('returns checked=0 when no recent chunks', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body.checked).toBe(0)
  })

  it('calls detectConflicts for each recent chunk', async () => {
    mockChunks.mockResolvedValue([{ id: 'c1', workspaceId: 'ws-1' }, { id: 'c2', workspaceId: 'ws-1' }] as never)
    await GET(req())
    expect(mockDetect).toHaveBeenCalledTimes(2)
  })
})
