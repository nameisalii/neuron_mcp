import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncJira } from '@/lib/jira/sync'

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
  const workspaceId = user.workspace.id

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, displayName: true },
  })
  if (!member || !ALLOWED_ROLES.has(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: 'jira' } },
    select: { id: true, accessToken: true, lastSyncAt: true, metadata: true },
  })
  if (!integration?.accessToken) {
    return NextResponse.json({ success: false, error: 'Jira is not connected' }, { status: 404 })
  }

  const secondsSinceSync = integration.lastSyncAt
    ? (Date.now() - integration.lastSyncAt.getTime()) / 1000
    : Infinity
  if (secondsSinceSync < SYNC_COOLDOWN_SECONDS) {
    return NextResponse.json({ success: false, error: 'Sync cooldown active, please wait' }, { status: 429 })
  }

  try {
    const result = await syncJira({
      workspaceId,
      integrationId: integration.id,
      encryptedToken: integration.accessToken,
      metadata: integration.metadata,
      lastSyncAt: integration.lastSyncAt,
      syncedBy: userId,
      syncedByName: member.displayName,
    })

    if (result.reconnectNeeded || result.permissionIssue || result.success) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          metadata: {
            ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata)
              ? integration.metadata as Record<string, unknown>
              : {}),
            status: result.reconnectNeeded
              ? 'needs_reconnect'
              : result.permissionIssue
                ? 'permission_issue'
                : 'connected',
            lastSyncMessage: result.message ?? null,
          },
        },
      }).catch(() => null)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[jira/sync] failed:', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json({ success: false, error: 'Jira sync failed' }, { status: 500 })
  }
}
