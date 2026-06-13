import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { syncLinearIssues, type LinearSyncResult } from '@/lib/linear/sync'

const SYNC_INTERVAL_MS = 5 * 60 * 1000

export async function runLinearBackgroundSync(workspaceId: string): Promise<LinearSyncResult> {
  const [integration, syncStatus] = await Promise.all([
    prisma.integration.findUnique({ where: { workspaceId_type: { workspaceId, type: 'linear' } } }),
    prisma.syncStatus.findUnique({ where: { workspaceId_integration: { workspaceId, integration: 'linear' } } }),
  ])
  if (!integration) throw new Error('No Linear integration found')
  if (syncStatus?.status === 'paused') {
    return emptyResult()
  }
  if (integration.lastSyncAt && Date.now() - integration.lastSyncAt.getTime() < SYNC_INTERVAL_MS) {
    return emptyResult()
  }

  const userId = syncStatus?.configuredBy ?? 'system'
  const member = userId === 'system'
    ? null
    : await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { displayName: true, status: true },
      })
  if (member && member.status !== 'active') throw new Error('Linear sync configurator is no longer active')
  const displayName = member?.displayName ?? 'Neuron'

  try {
    await trackEvent(workspaceId, userId, displayName, 'sync', 'Linear background sync started', {
      integration: 'linear', action: 'started', mode: 'background',
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
        workspaceId, integration: 'linear', mode: 'background', status: 'active', configuredBy: userId,
        lastSyncAt: new Date(), nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS),
      },
      update: { status: 'active', lastSyncAt: new Date(), nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS), errorMessage: null },
    })
    await trackEvent(workspaceId, userId, displayName, 'sync', 'Linear background sync completed', {
      integration: 'linear', action: 'completed', mode: 'background', ...result,
    })
    return result
  } catch (err) {
    await trackEvent(workspaceId, userId, displayName, 'sync', 'Linear background sync failed', {
      integration: 'linear', action: 'failed', mode: 'background',
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    throw err
  }
}

function emptyResult(): LinearSyncResult {
  return {
    success: true,
    synced: 0,
    extracted: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    issuesFound: 0,
    teamsScanned: 0,
    teams: [],
    organization: { id: '', name: '' },
    viewer: { id: '', name: '' },
    skippedReasons: {},
  }
}
