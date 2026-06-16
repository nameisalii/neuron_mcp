import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncSlackMessagesDetailed } from '@/lib/slack/sync'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

function extractionErrorCount(diagnostics: ExtractionDiagnostics) {
  return diagnostics.extractorParseFailed
    + diagnostics.validationFailed
    + diagnostics.knowledgeItemCreateFailed
    + diagnostics.embeddingUpsertFailed
    + diagnostics.itemProcessingFailed
}

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: {
        workspace: {
          select: {
            id: true,
            integrations: { where: { type: 'slack' }, take: 1 },
          },
        },
      },
    })

    if (!user?.workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    if (!user.workspace.integrations.length) {
      return NextResponse.json({ error: 'No Slack integration found' }, { status: 404 })
    }

    const workspaceId = user.workspace.id

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const integration = user.workspace.integrations[0]
    const secondsSinceSync = integration.lastSyncAt
      ? Math.floor((Date.now() - integration.lastSyncAt.getTime()) / 1000)
      : null
    const fetchResult = await syncSlackMessagesDetailed(workspaceId)
    const messages = fetchResult.messages
    const extraction = await extractKnowledgeDetailed(messages, workspaceId, 'slack')
    const extractionErrors = extractionErrorCount(extraction.diagnostics)

    const summary = {
      workspaceId,
      integrationId: integration.id,
      integration: 'slack',
      fetched: messages.length,
      processed: extraction.diagnostics.extractorCalled,
      textItems: messages.length,
      chunks: extraction.diagnostics.extractorCalled,
      knowledgeItemsCreated: extraction.items.length,
      knowledgeItemsUpdated: 0,
      skipped: messages.length > 0 && extraction.items.length === 0 ? messages.length : 0,
      skippedReasons: messages.length === 0
        ? { ...fetchResult.skippedReasons, no_accessible_messages: 1 }
        : extraction.items.length === 0
          ? { ...fetchResult.skippedReasons, no_extractable_knowledge: messages.length }
          : fetchResult.skippedReasons,
      extractionErrors,
      embeddingErrors: extraction.diagnostics.embeddingUpsertFailed,
      databaseErrors: extraction.diagnostics.knowledgeItemCreateFailed,
      channelsDiscovered: fetchResult.channelsDiscovered,
      channelsScanned: fetchResult.channelsScanned,
      secondsSinceSync,
    }
    console.info('[slack/sync] summary', summary)

    if (messages.length > 0 && extraction.items.length === 0 && extractionErrors > 0) {
      return NextResponse.json({
        success: false,
        fetched: messages.length,
        processed: extraction.diagnostics.extractorCalled,
        knowledgeCreated: 0,
        knowledgeUpdated: 0,
        skipped: messages.length,
        extracted: 0,
        extractionDiagnostics: extraction.diagnostics,
        skippedReasons: summary.skippedReasons,
        error: 'Slack sync fetched messages, but extraction failed for every item.',
      }, { status: 502 })
    }

    await prisma.integration.update({
      where: { workspaceId_type: { workspaceId, type: 'slack' } },
      data: { lastSyncAt: new Date() },
    })

    const conflicts = extraction.items.length === 0
      ? 0
      : await prisma.knowledgeItem.count({
          where: { workspaceId, frozen: true, source: 'slack' },
        })

    return NextResponse.json({
      success: true,
      fetched: messages.length,
      processed: extraction.diagnostics.extractorCalled,
      knowledgeCreated: extraction.items.length,
      knowledgeUpdated: 0,
      skipped: summary.skipped,
      skippedReasons: summary.skippedReasons,
      synced: messages.length,
      extracted: extraction.items.length,
      chunksExtracted: extraction.diagnostics.extractorCalled,
      extractionEmbeddingErrors: extractionErrors,
      extractionDiagnostics: extraction.diagnostics,
      conflicts,
      message: messages.length === 0
        ? 'Slack sync found 0 messages. Invite the Neuron bot to channels or check Slack scopes.'
        : extraction.items.length === 0
          ? 'Synced 0 items — no extractable knowledge found'
          : undefined,
    })
  } catch (err) {
    console.error('[slack/sync]', err)
    return NextResponse.json({
      success: false,
      fetched: 0,
      processed: 0,
      knowledgeCreated: 0,
      knowledgeUpdated: 0,
      skipped: 0,
      extracted: 0,
      error: err instanceof Error ? `Sync failed — ${err.message}` : 'Sync failed',
    }, { status: 500 })
  }
}
