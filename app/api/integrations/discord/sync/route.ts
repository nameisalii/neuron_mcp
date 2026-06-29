import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { syncDiscord } from '@/lib/discord/sync'
import { getDiscordBotToken } from '@/lib/discord/config'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const SYNC_COOLDOWN_SECONDS = 60

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Missing Discord env must not break the route — return a safe message.
  const botToken = getDiscordBotToken()
  if (!botToken) {
    return NextResponse.json(
      { success: false, error: 'Discord is not configured. Add Discord environment variables to enable this integration.' },
      { status: 200 },
    )
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

  const { id: workspaceId } = user.workspace
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, displayName: true },
  })
  if (!member || !ALLOWED_ROLES.has(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: 'discord' } },
    select: { id: true, teamId: true, lastSyncAt: true },
  })
  if (!integration?.teamId) {
    return NextResponse.json({ error: 'Discord is not connected' }, { status: 404 })
  }

  const secondsSinceSync = integration.lastSyncAt
    ? (Date.now() - integration.lastSyncAt.getTime()) / 1000
    : Infinity
  if (secondsSinceSync < SYNC_COOLDOWN_SECONDS) {
    return NextResponse.json({ success: false, error: 'Sync cooldown active, please wait' }, { status: 429 })
  }

  try {
    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Discord sync started', {
      integration: 'discord',
      action: 'started',
      mode: 'manual',
    })

    const result = await syncDiscord({
      workspaceId,
      guildId: integration.teamId,
      botToken,
      syncedBy: userId,
      syncedByName: member.displayName,
    })

    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      guildId: result.guildId,
      channelsDiscovered: result.channelsDiscovered,
      channelsScanned: result.channelsScanned,
      messagesFetched: result.messagesFetched,
      processed: result.processed,
      knowledgeCreated: result.knowledgeCreated,
      knowledgeUpdated: result.knowledgeUpdated,
      skipped: result.skipped,
      skippedReasons: result.skippedReasons,
      extractionErrors: result.extractionErrors,
      embeddingErrors: result.embeddingErrors,
      databaseErrors: result.databaseErrors,
      lastSyncedAt: new Date().toISOString(),
      message: result.message,
    })
  } catch (err) {
    // Discord errors can carry message context — log only a safe marker.
    console.error('[discord/sync] failed:', err instanceof Error ? err.message : 'unknown error')
    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Discord sync failed', {
      integration: 'discord',
      action: 'failed',
      mode: 'manual',
    }).catch(() => null)
    return NextResponse.json({ success: false, error: 'Discord sync failed' }, { status: 500 })
  }
}
