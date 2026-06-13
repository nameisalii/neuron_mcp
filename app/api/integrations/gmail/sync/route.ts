import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncGmail } from '@/lib/gmail/sync'
import { trackEvent } from '@/lib/activity'
import type { GmailSyncMetadata } from '@/types'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const SYNC_COOLDOWN_SECONDS = 60

function emptyResult(error: string) {
  return NextResponse.json({
    success: false,
    selectedLabels: [],
    labelIdsUsed: [],
    gmailQueryUsed: null,
    messagesFoundBeforeFiltering: 0,
    messagesFetched: 0,
    threadsCreated: 0,
    chunksCreated: 0,
    skippedReasons: {},
    importedThreads: 0,
    importedChunks: 0,
    extractedKnowledgeItems: 0,
    aiExtractedKnowledgeItems: 0,
    fallbackKnowledgeItems: 0,
    chunksEmbedded: 0,
    extractionDiagnostics: {},
    skipped: 0,
    deleted: 0,
    labelsScanned: 0,
    namespaceUsed: null,
    syncFrom: null,
    configuredSyncFrom: null,
    effectiveQueryStart: null,
    lastSyncAtBeforeRun: null,
    lastSyncAtAfterRun: null,
    lastSyncAttemptAt: null,
    lastSuccessfulImportAt: null,
    lastSyncedAt: null,
    canReadMailbox: null,
    recentMessagesAvailable: null,
    inboxMessagesAvailable: null,
    sentMessagesAvailable: null,
    diagnosticRecentCount: null,
    diagnosticInboxCount: null,
    diagnosticSentCount: null,
    error,
  }, { status: 400 })
}

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
    where: { workspaceId_type: { workspaceId, type: 'gmail' } },
    select: { id: true, accessToken: true, lastSyncAt: true, metadata: true },
  })
  if (!integration) return NextResponse.json({ error: 'Gmail is not connected' }, { status: 404 })

  const metadata = (integration.metadata as GmailSyncMetadata | null) ?? null
  if (!metadata?.selectedLabels?.length) {
    return emptyResult('Gmail is connected but not configured. Choose labels before syncing.')
  }

  const secondsSinceSync = integration.lastSyncAt
    ? (Date.now() - integration.lastSyncAt.getTime()) / 1000
    : Infinity
  if (secondsSinceSync < SYNC_COOLDOWN_SECONDS) {
    return NextResponse.json({
      success: false,
      selectedLabels: metadata.selectedLabels ?? [],
      labelIdsUsed: metadata.selectedLabels ?? [],
      gmailQueryUsed: null,
      messagesFoundBeforeFiltering: 0,
      messagesFetched: 0,
      threadsCreated: 0,
      chunksCreated: 0,
      skippedReasons: {},
      importedThreads: 0,
      importedChunks: 0,
      extractedKnowledgeItems: 0,
      aiExtractedKnowledgeItems: 0,
      fallbackKnowledgeItems: 0,
      chunksEmbedded: 0,
      extractionDiagnostics: {},
      skipped: 0,
      deleted: 0,
      labelsScanned: 0,
      namespaceUsed: `${workspaceId}:${userId}`,
      syncFrom: metadata.syncFrom ?? null,
      configuredSyncFrom: metadata.syncFrom ?? null,
      effectiveQueryStart: null,
      lastSyncAtBeforeRun: integration.lastSyncAt?.toISOString() ?? null,
      lastSyncAtAfterRun: integration.lastSyncAt?.toISOString() ?? null,
      lastSyncAttemptAt: metadata.lastSyncAttemptAt ?? integration.lastSyncAt?.toISOString() ?? null,
      lastSuccessfulImportAt: metadata.lastSuccessfulImportAt ?? null,
      lastSyncedAt: integration.lastSyncAt?.toISOString() ?? null,
      canReadMailbox: null,
      recentMessagesAvailable: null,
      inboxMessagesAvailable: null,
      sentMessagesAvailable: null,
      diagnosticRecentCount: null,
      diagnosticInboxCount: null,
      diagnosticSentCount: null,
      error: 'Sync cooldown active, please wait',
    }, { status: 429 })
  }

  try {
    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Gmail sync started', {
      integration: 'gmail',
      action: 'started',
      mode: 'manual',
      labelsScanned: metadata.selectedLabels.length,
    })

    const result = await syncGmail({
      workspaceId,
      accessToken: integration.accessToken,
      syncedBy: userId,
      syncedByName: member.displayName,
      metadata,
      lastSyncAt: integration.lastSyncAt,
    })

    const syncStatusData = {
      status: 'active' as const,
      nextSyncAt: new Date(Date.now() + 5 * 60 * 1000),
      errorMessage: null,
    }
    if (result.lastSyncAtAfterRun) {
      const lastSyncedAt = new Date(result.lastSyncAtAfterRun)
      await prisma.syncStatus.upsert({
        where: { workspaceId_integration: { workspaceId, integration: 'gmail' } },
        create: {
          workspaceId,
          integration: 'gmail',
          mode: 'background',
          configuredBy: userId,
          lastSyncAt: lastSyncedAt,
          ...syncStatusData,
        },
        update: {
          ...syncStatusData,
          lastSyncAt: lastSyncedAt,
        },
      })
    } else {
      await prisma.syncStatus.upsert({
        where: { workspaceId_integration: { workspaceId, integration: 'gmail' } },
        create: {
          workspaceId,
          integration: 'gmail',
          mode: 'background',
          configuredBy: userId,
          ...syncStatusData,
        },
        update: syncStatusData,
      })
    }

    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Gmail sync completed', {
      integration: 'gmail',
      action: 'completed',
      mode: 'manual',
      ...result,
    })

    return NextResponse.json({
      success: true,
      selectedLabels: result.selectedLabels,
      labelIdsUsed: result.labelIdsUsed,
      gmailQueryUsed: result.gmailQueryUsed,
      messagesFoundBeforeFiltering: result.messagesFoundBeforeFiltering,
      messagesFetched: result.messagesFetched,
      threadsCreated: result.threadsCreated,
      chunksCreated: result.chunksCreated,
      skippedReasons: result.skippedReasons,
      importedThreads: result.importedThreads,
      importedChunks: result.importedChunks,
      extractedKnowledgeItems: result.extractedKnowledgeItems,
      aiExtractedKnowledgeItems: result.aiExtractedKnowledgeItems,
      fallbackKnowledgeItems: result.fallbackKnowledgeItems,
      chunksEmbedded: result.chunksEmbedded,
      extractionDiagnostics: result.extractionDiagnostics,
      skipped: result.skipped,
      deleted: result.deleted,
      labelsScanned: result.labelsScanned,
      namespaceUsed: result.namespaceUsed,
      syncFrom: result.syncFrom,
      configuredSyncFrom: result.configuredSyncFrom,
      effectiveQueryStart: result.effectiveQueryStart,
      lastSyncAtBeforeRun: result.lastSyncAtBeforeRun,
      lastSyncAtAfterRun: result.lastSyncAtAfterRun,
      lastSyncAttemptAt: result.lastSyncAttemptAt,
      lastSuccessfulImportAt: result.lastSuccessfulImportAt,
      lastSyncedAt: result.lastSyncedAt,
      canReadMailbox: result.canReadMailbox ?? true,
      recentMessagesAvailable: result.recentMessagesAvailable ?? null,
      inboxMessagesAvailable: result.inboxMessagesAvailable ?? null,
      sentMessagesAvailable: result.sentMessagesAvailable ?? null,
      diagnosticRecentCount: result.diagnosticRecentCount ?? null,
      diagnosticInboxCount: result.diagnosticInboxCount ?? null,
      diagnosticSentCount: result.diagnosticSentCount ?? null,
      message: result.message,
    })
  } catch (err) {
    console.error('[gmail/sync]', err)
    await prisma.syncStatus.upsert({
      where: { workspaceId_integration: { workspaceId, integration: 'gmail' } },
      create: {
        workspaceId,
        integration: 'gmail',
        mode: 'background',
        status: 'error',
        configuredBy: userId,
        errorMessage: err instanceof Error ? err.message : 'Sync failed',
      },
      update: {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Sync failed',
      },
    }).catch(() => null)

    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Gmail sync failed', {
      integration: 'gmail',
      action: 'failed',
      mode: 'manual',
      error: err instanceof Error ? err.message : 'Unknown error',
    })

    return NextResponse.json({
      success: false,
      selectedLabels: metadata.selectedLabels ?? [],
      labelIdsUsed: metadata.selectedLabels ?? [],
      gmailQueryUsed: null,
      messagesFoundBeforeFiltering: 0,
      messagesFetched: 0,
      threadsCreated: 0,
      chunksCreated: 0,
      skippedReasons: {},
      importedThreads: 0,
      importedChunks: 0,
      extractedKnowledgeItems: 0,
      aiExtractedKnowledgeItems: 0,
      fallbackKnowledgeItems: 0,
      chunksEmbedded: 0,
      extractionDiagnostics: {},
      skipped: 0,
      deleted: 0,
      labelsScanned: metadata.selectedLabels.length,
      namespaceUsed: `${workspaceId}:${userId}`,
      syncFrom: metadata.syncFrom ?? null,
      configuredSyncFrom: metadata.syncFrom ?? null,
      effectiveQueryStart: null,
      lastSyncAtBeforeRun: integration.lastSyncAt?.toISOString() ?? null,
      lastSyncAtAfterRun: integration.lastSyncAt?.toISOString() ?? null,
      lastSyncAttemptAt: metadata.lastSyncAttemptAt ?? integration.lastSyncAt?.toISOString() ?? null,
      lastSuccessfulImportAt: metadata.lastSuccessfulImportAt ?? null,
      lastSyncedAt: integration.lastSyncAt?.toISOString() ?? null,
      canReadMailbox: null,
      recentMessagesAvailable: null,
      inboxMessagesAvailable: null,
      sentMessagesAvailable: null,
      diagnosticRecentCount: null,
      diagnosticInboxCount: null,
      diagnosticSentCount: null,
      error: err instanceof Error ? err.message : 'Sync failed',
    }, { status: 500 })
  }
}
