/**
 * @jest-environment node
 */
import { generateDailyDigest, generateWeeklyDigest } from '../generate'
import { prisma } from '@/lib/db'
import { openai } from '@/lib/openai'

jest.mock('@/lib/db', () => ({
  prisma: {
    captureLog: { count: jest.fn() },
    notionChunk: { count: jest.fn() },
    queryLog: { count: jest.fn() },
    alert: { count: jest.fn() },
    activityEvent: { findMany: jest.fn() },
  },
}))
jest.mock('@/lib/openai', () => ({
  openai: { chat: { completions: { create: jest.fn() } } },
}))

const mockCaptureCount = jest.mocked(prisma.captureLog.count)
const mockChunkCount = jest.mocked(prisma.notionChunk.count)
const mockQueryCount = jest.mocked(prisma.queryLog.count)
const mockAlertCount = jest.mocked(prisma.alert.count)
const mockActivity = jest.mocked(prisma.activityEvent.findMany)
const mockChat = jest.mocked(openai.chat.completions.create)

const WS = 'ws-1'
const UID = 'user-1'

beforeEach(() => {
  jest.clearAllMocks()
  mockCaptureCount.mockResolvedValue(5)
  mockChunkCount.mockResolvedValue(3)
  mockQueryCount.mockResolvedValue(2)
  mockAlertCount.mockResolvedValue(1)
  mockActivity.mockResolvedValue([])
  mockChat.mockResolvedValue({ choices: [{ message: { content: 'Great day of captures.' } }] } as never)
})

describe('generateDailyDigest', () => {
  it('returns DigestContent with summary from GPT', async () => {
    const result = await generateDailyDigest(WS, UID)
    expect(result.summary).toBe('Great day of captures.')
    expect(result.stats).toMatchObject({ synced: 5, labeled: 3, queries: 2, alerts: 1 })
  })

  it('falls back to static summary when GPT fails', async () => {
    mockChat.mockRejectedValue(new Error('OpenAI down'))
    const result = await generateDailyDigest(WS, UID)
    expect(result.summary).toContain('5 items captured')
  })

  it('includes alert highlight when alerts > 0', async () => {
    const result = await generateDailyDigest(WS, UID)
    expect(result.highlights.some((h) => h.type === 'alert')).toBe(true)
  })

  it('omits alert highlight when no alerts', async () => {
    mockAlertCount.mockResolvedValue(0)
    const result = await generateDailyDigest(WS, UID)
    expect(result.highlights.some((h) => h.type === 'alert')).toBe(false)
  })

  it('queries prisma with workspaceId and userId', async () => {
    await generateDailyDigest(WS, UID)
    expect(mockQueryCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS, userId: UID }) }),
    )
  })

  it('passes focusAreas to GPT prompt when provided', async () => {
    await generateDailyDigest(WS, UID, {
      focusAreas: ['engineering', 'security'],
      staleThresholdDays: 30,
      digestEnabled: true,
      emailDigest: false,
    })
    const userMsg = (mockChat.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> })
      .messages.find((m) => m.role === 'user')
    expect(userMsg?.content).toContain('engineering')
  })
})

describe('generateWeeklyDigest', () => {
  it('returns DigestContent with weekly period reference in fallback', async () => {
    mockChat.mockRejectedValue(new Error('fail'))
    const result = await generateWeeklyDigest(WS, UID)
    expect(result.summary).toContain('7 days')
  })
})
