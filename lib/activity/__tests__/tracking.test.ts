import { prisma } from '@/lib/db'
import { trackEvent, trackValidationEvent } from '@/lib/activity'

jest.mock('@/lib/db', () => ({ prisma: { activityEvent: { create: jest.fn() } } }))

const originalStrict = process.env.ACTIVITY_TRACKING_STRICT

afterEach(() => {
  process.env.ACTIVITY_TRACKING_STRICT = originalStrict
  jest.clearAllMocks()
})

it('returns a safe failure result when the activity write fails', async () => {
  jest.mocked(prisma.activityEvent.create).mockRejectedValue(new Error('database unavailable'))
  await expect(trackEvent('ws-1', 'user-1', 'Ali', 'query', 'Query recorded')).resolves.toEqual({
    ok: false,
    errorCode: 'ACTIVITY_WRITE_FAILED',
  })
})

it('throws a safe code in strict mode', async () => {
  process.env.ACTIVITY_TRACKING_STRICT = 'true'
  jest.mocked(prisma.activityEvent.create).mockRejectedValue(new Error('private database error'))
  await expect(trackEvent('ws-1', 'user-1', 'Ali', 'query', 'Query recorded')).rejects.toThrow('ACTIVITY_WRITE_FAILED')
})

it('validation events return their write result instead of disappearing', async () => {
  jest.mocked(prisma.activityEvent.create).mockResolvedValue({ id: 'event-1' } as never)
  await expect(trackValidationEvent('ws-1', 'user-1', 'Ali', 'save_decision', 'Decision saved')).resolves.toEqual({
    ok: true,
    eventId: 'event-1',
  })
})
