import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { trackEvent } from '@/lib/activity'
import { syncGranola } from '@/lib/granola/sync'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const SYNC_COOLDOWN_SECONDS = 60

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    where: { workspaceId_type: { workspaceId, type: 'granola' } },
    select: { id: true, accessToken: true, lastSyncAt: true },
  })
  if (!integration?.accessToken) {
    return NextResponse.json({ error: 'Granola is not connected' }, { status: 404 })
  }

  const secondsSinceSync = integration.lastSyncAt
    ? (Date.now() - integration.lastSyncAt.getTime()) / 1000
    : Infinity
  if (secondsSinceSync < SYNC_COOLDOWN_SECONDS) {
    return NextResponse.json({ success: false, error: 'Sync cooldown active, please wait' }, { status: 429 })
  }

  let token: string
  try {
    token = decrypt(integration.accessToken)
  } catch {
    return NextResponse.json({ error: 'Granola connection is corrupted — reconnect Granola' }, { status: 422 })
  }

  try {
    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Granola sync started', {
      integration: 'granola',
      action: 'started',
      mode: 'manual',
    })

    const result = await syncGranola({
      workspaceId,
      token,
      syncedBy: userId,
      syncedByName: member.displayName,
      lastSyncAt: integration.lastSyncAt,
    })

    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      fetched: result.fetched,
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
    // Granola errors can carry note context — log only a safe marker.
    console.error('[granola/sync] failed:', err instanceof Error ? err.message : 'unknown error')
    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Granola sync failed', {
      integration: 'granola',
      action: 'failed',
      mode: 'manual',
    }).catch(() => null)
    return NextResponse.json({ success: false, error: 'Granola sync failed' }, { status: 500 })
  }
}
