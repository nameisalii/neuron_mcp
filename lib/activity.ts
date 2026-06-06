import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { ActivityEventType } from '@/types'

export async function trackEvent(
  workspaceId: string,
  userId: string,
  displayName: string,
  eventType: ActivityEventType,
  description: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: { workspaceId, userId, displayName, eventType, description, metadata: (metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull },
    })
  } catch (err) {
    // Fire-and-forget — never block the caller on analytics failures
    console.error('[activity] trackEvent failed', err)
  }
}
