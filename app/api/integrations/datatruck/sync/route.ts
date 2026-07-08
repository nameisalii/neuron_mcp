import { auth } from '@clerk/nextjs/server'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { decrypt } from '@/lib/crypto'
import { trackEvent } from '@/lib/activity'
import { syncDatatruckKnowledge } from '@/lib/datatruck/sync'

const SYNC_ERROR_MESSAGE = 'Datatruck sync failed. Check API token or permissions.'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  const connector = await prisma.apiConnector.findUnique({
    where: { workspaceId_sourceKey: { workspaceId: workspace.workspaceId, sourceKey: 'datatruck' } },
    select: { id: true, apiBaseUrl: true, encryptedCredential: true, metadata: true },
  })
  if (!connector?.encryptedCredential || !connector.apiBaseUrl) {
    return NextResponse.json({ success: false, error: 'Datatruck is not connected.' }, { status: 404 })
  }

  let apiToken: string
  try {
    apiToken = decrypt(connector.encryptedCredential)
  } catch {
    return NextResponse.json(
      { success: false, error: 'Datatruck connection is corrupted — reconnect Datatruck.' },
      { status: 422 },
    )
  }

  const metadata = connector.metadata && typeof connector.metadata === 'object' && !Array.isArray(connector.metadata)
    ? connector.metadata as Record<string, unknown>
    : {}

  try {
    const result = await syncDatatruckKnowledge(
      workspace.workspaceId,
      { apiBaseUrl: connector.apiBaseUrl, apiToken },
    )

    const nextMetadata = {
      ...metadata,
      lastSyncSummary: {
        fetched: result.totalFetched,
        created: result.totalCreated,
        updated: result.totalUpdated,
        skipped: result.totalSkipped,
        embeddingErrors: result.embeddingErrors,
        warnings: result.warnings,
        endpoints: result.endpoints,
      },
    }
    await prisma.apiConnector.update({
      where: { id: connector.id },
      data: {
        status: result.ok ? 'connected' : 'sync_error',
        ...(result.ok ? { lastSyncAt: new Date() } : {}),
        metadata: nextMetadata as unknown as Prisma.InputJsonValue,
      },
    })

    await trackEvent(
      workspace.workspaceId,
      userId,
      workspace.member.displayName,
      'sync',
      result.ok ? 'Datatruck sync completed' : 'Datatruck sync failed',
      {
        integration: 'datatruck',
        action: result.ok ? 'completed' : 'completed_with_warnings',
        mode: 'manual',
        fetched: result.totalFetched,
        created: result.totalCreated,
        updated: result.totalUpdated,
        failedEndpoints: result.failedEndpoints,
        warnings: result.warnings,
      },
    ).catch(() => null)

    return NextResponse.json({
      success: result.ok || result.totalFetched > 0,
      synced: result.totalCreated + result.totalUpdated,
      fetched: result.totalFetched,
      created: result.totalCreated,
      updated: result.totalUpdated,
      skipped: result.totalSkipped,
      hasMore: result.hasMore,
      lastSyncedAt: result.ok ? new Date().toISOString() : null,
      message: result.message,
      endpoints: result.endpoints,
      warnings: result.warnings,
    })
  } catch (err) {
    // Log only a safe marker — never the token or raw API payloads.
    console.error('[datatruck/sync] failed:', err instanceof Error ? err.message : 'unknown error')
    await prisma.apiConnector.update({ where: { id: connector.id }, data: { status: 'sync_error' } }).catch(() => null)
    return NextResponse.json({ success: false, error: SYNC_ERROR_MESSAGE }, { status: 500 })
  }
}
