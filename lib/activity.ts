import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { ActivityEventType } from '@/types'

export type TrackEventResult =
  | { ok: true; eventId: string }
  | { ok: false; errorCode: 'ACTIVITY_WRITE_FAILED' }

export async function trackEvent(
  workspaceId: string,
  userId: string,
  displayName: string,
  eventType: ActivityEventType,
  description: string,
  metadata?: Record<string, unknown>,
): Promise<TrackEventResult | void> {
  try {
    const event = await prisma.activityEvent.create({
      data: { workspaceId, userId, displayName, eventType, description, metadata: (metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull },
      select: { id: true },
    })
    return { ok: true, eventId: event.id }
  } catch (err) {
    console.error('[activity] write failed', { eventType, errorCode: 'ACTIVITY_WRITE_FAILED' })
    if (process.env.ACTIVITY_TRACKING_STRICT === 'true') throw new Error('ACTIVITY_WRITE_FAILED')
    return { ok: false, errorCode: 'ACTIVITY_WRITE_FAILED' }
  }
}

const VALIDATION_EVENTS = new Set<ActivityEventType>([
  'query',
  'query_failed',
  'save_decision',
  'onboarding_question_answered',
  'onboarding_completed',
])

export async function trackValidationEvent(
  workspaceId: string,
  userId: string,
  displayName: string,
  eventType: ActivityEventType,
  description: string,
  metadata?: Record<string, unknown>,
): Promise<TrackEventResult> {
  if (!VALIDATION_EVENTS.has(eventType)) throw new Error('INVALID_VALIDATION_EVENT')
  const result = await trackEvent(workspaceId, userId, displayName, eventType, description, metadata)
  if (!result) return { ok: false, errorCode: 'ACTIVITY_WRITE_FAILED' }
  if (!result.ok) console.error('[validation] event missing', { eventType, errorCode: result.errorCode })
  return result
}
