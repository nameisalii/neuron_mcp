import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncLinearIssues } from '@/lib/linear/sync'
import { trackEvent } from '@/lib/activity'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const SYNC_COOLDOWN_SECONDS = 60

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: {
      workspace: {
        select: {
          id: true,
          integrations: { where: { type: 'linear' }, take: 1 },
        },
      },
    },
  })

  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
  if (!user.workspace.integrations.length) {
    return NextResponse.json({ error: 'No Linear integration found' }, { status: 404 })
  }

  const workspaceId = user.workspace.id

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, displayName: true },
  })
  if (!member || !ALLOWED_ROLES.has(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const integration = user.workspace.integrations[0]
  const secondsSinceSync = integration.lastSyncAt
    ? (Date.now() - integration.lastSyncAt.getTime()) / 1000
    : Infinity
  if (secondsSinceSync < SYNC_COOLDOWN_SECONDS) {
    return NextResponse.json({
      success: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      extracted: 0,
      teamsScanned: 0,
      issuesFound: 0,
      error: 'Sync cooldown active, please wait',
    }, { status: 429 })
  }

  try {
    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Linear sync started', {
      integration: 'linear',
      action: 'started',
      mode: 'manual',
    })
    const result = await syncLinearIssues({
      id: integration.id,
      workspaceId,
      accessToken: integration.accessToken,
      lastSyncAt: integration.lastSyncAt,
      metadata: integration.metadata as Record<string, unknown> | null,
    })
    await prisma.syncStatus.upsert({
      where: { workspaceId_integration: { workspaceId, integration: 'linear' } },
      create: {
        workspaceId, integration: 'linear', mode: 'background', status: 'active',
        configuredBy: userId, lastSyncAt: new Date(), nextSyncAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      update: { status: 'active', lastSyncAt: new Date(), nextSyncAt: new Date(Date.now() + 5 * 60 * 1000), errorMessage: null },
    })
    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Linear sync completed', {
      integration: 'linear',
      action: 'completed',
      mode: 'manual',
      ...result,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[linear/sync]', err)
    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Linear sync failed', {
      integration: 'linear',
      action: 'failed',
      mode: 'manual',
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    if (err instanceof Error && err.message.toLowerCase().includes('decrypt')) {
      await prisma.integration
        .update({
          where: { workspaceId_type: { workspaceId, type: 'linear' } },
          data: { metadata: { status: 'invalid_token' } },
        })
        .catch(() => null)
      return NextResponse.json({
        success: false,
        fetched: 0,
        processed: 0,
        knowledgeCreated: 0,
        knowledgeUpdated: 0,
        imported: 0,
        updated: 0,
        skipped: 0,
        deleted: 0,
        extracted: 0,
        teamsScanned: 0,
        issuesFound: 0,
        error: 'Token invalid — reconnect Linear',
      }, { status: 422 })
    }
    return NextResponse.json({
      success: false,
      fetched: 0,
      processed: 0,
      knowledgeCreated: 0,
      knowledgeUpdated: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      extracted: 0,
      teamsScanned: 0,
      issuesFound: 0,
      error: err instanceof Error ? err.message : 'Sync failed',
    }, { status: 500 })
  }
}
