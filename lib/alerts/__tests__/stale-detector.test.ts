/**
 * @jest-environment node
 */
import { detectStaleChunks } from '../stale-detector'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    userPreference: { findFirst: jest.fn() },
    notionChunk: { findMany: jest.fn() },
    alert: { findFirst: jest.fn(), create: jest.fn() },
  },
}))

const mockPrefFind = jest.mocked(prisma.userPreference.findFirst)
const mockChunkFind = jest.mocked(prisma.notionChunk.findMany)
const mockAlertFind = jest.mocked(prisma.alert.findFirst)
const mockAlertCreate = jest.mocked(prisma.alert.create)

const WS = 'ws-1'

function makeChunk(id: string, pageId: string, pageTitle: string, labels: string[]) {
  return { id, notionPageId: pageId, labels, page: { id: pageId, title: pageTitle } }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrefFind.mockResolvedValue(null)
  mockChunkFind.mockResolvedValue([])
  mockAlertFind.mockResolvedValue(null)
  mockAlertCreate.mockResolvedValue({} as never)
})

describe('detectStaleChunks', () => {
  it('returns 0 when no old chunks', async () => {
    const count = await detectStaleChunks(WS)
    expect(count).toBe(0)
    expect(mockAlertCreate).not.toHaveBeenCalled()
  })

  it('skips chunks with empty labels array', async () => {
    mockChunkFind.mockResolvedValue([makeChunk('c1', 'p1', 'Page 1', [])] as never)
    const count = await detectStaleChunks(WS)
    expect(count).toBe(0)
  })

  it('creates one alert per page with labeled chunks', async () => {
    mockChunkFind.mockResolvedValue([
      makeChunk('c1', 'p1', 'Policy Doc', ['rule']),
      makeChunk('c2', 'p1', 'Policy Doc', ['decision']),
    ] as never)
    const count = await detectStaleChunks(WS)
    expect(count).toBe(1)
    expect(mockAlertCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'stale', workspaceId: WS, title: expect.stringContaining('Policy Doc') }),
      }),
    )
  })

  it('creates separate alerts for separate pages', async () => {
    mockChunkFind.mockResolvedValue([
      makeChunk('c1', 'p1', 'Page 1', ['rule']),
      makeChunk('c2', 'p2', 'Page 2', ['decision']),
    ] as never)
    const count = await detectStaleChunks(WS)
    expect(count).toBe(2)
  })

  it('skips page with existing unresolved stale alert', async () => {
    mockChunkFind.mockResolvedValue([makeChunk('c1', 'p1', 'Policy Doc', ['rule'])] as never)
    mockAlertFind.mockResolvedValue({ id: 'existing' } as never)
    const count = await detectStaleChunks(WS)
    expect(count).toBe(0)
  })

  it('uses staleThresholdDays from UserPreference', async () => {
    mockPrefFind.mockResolvedValue({ staleThresholdDays: 60 } as never)
    await detectStaleChunks(WS)
    expect(mockChunkFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) }),
    )
  })
})
