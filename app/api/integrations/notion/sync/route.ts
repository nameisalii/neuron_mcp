import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncNotionPages } from '@/lib/notion/sync'
import { getConnectedIntegrationToken } from '@/lib/integrations/connection-server'

export const maxDuration = 120

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let workspaceId: string | undefined
    try {
      const body = await req.json()
      workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : undefined
    } catch {
      // no body or non-JSON — fall through to user lookup
    }

    if (!workspaceId) {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { workspace: { select: { id: true } } },
      })
      if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
      workspaceId = user.workspace.id
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true, displayName: true },
    })

    if (!member || member.status !== 'active' || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const integration = await prisma.integration.findUnique({
      where: { workspaceId_type: { workspaceId, type: 'notion' } },
      select: {
        id: true,
        type: true,
        accessToken: true,
        metadata: true,
        workspace: {
          select: {
            type: true,
            owner: { select: { clerkId: true } },
          },
        },
      },
    })
    if (!integration) {
      return NextResponse.json(
        { error: 'Notion is not connected. Connect Notion first.' },
        { status: 400 },
      )
    }
    const accessToken = getConnectedIntegrationToken(integration, {
      currentUserId: userId,
      workspaceType: integration.workspace.type,
      workspaceOwnerClerkId: integration.workspace.owner.clerkId,
    })
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Notion is not connected. Connect Notion first.' },
        { status: 400 },
      )
    }

    const { displayName } = member
    const result = await syncNotionPages(workspaceId, userId, displayName, accessToken)
    const knowledgeCreated = result.knowledgeCreated ?? 0
    const knowledgeUpdated = result.knowledgeUpdated ?? 0
    const fetched = result.fetched ?? result.pages
    const extractionErrors = result.extractionEmbeddingErrors ?? 0

    console.info('[notion/sync] route summary', {
      workspaceId,
      integrationId: integration.id,
      integration: 'notion',
      fetched,
      processed: result.processed ?? result.pages,
      textItems: result.diagnostics?.textCharactersExtracted ? result.pages : 0,
      chunks: result.chunksExtracted ?? result.chunks,
      knowledgeCreated,
      knowledgeUpdated,
      skipped: result.skipped,
      skippedReasons: result.skippedReasons ?? {},
      extractionErrors,
      embeddingErrors: 0,
      databaseErrors: 0,
    })

    await prisma.integration.update({
      where: { workspaceId_type: { workspaceId, type: 'notion' } },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      fetched,
      processed: result.processed ?? result.pages,
      knowledgeCreated,
      knowledgeUpdated,
      skipped: result.skipped,
      extracted: knowledgeCreated + knowledgeUpdated,
      chunksExtracted: result.chunksExtracted ?? result.chunks,
      extractionEmbeddingErrors: extractionErrors,
      skippedReasons: result.skippedReasons ?? {},
      diagnostics: result.diagnostics,
      pagesProcessed: result.pages,
      chunksCreated: result.chunks,
      failed: result.failed,
      syncedBy: displayName,
      message: fetched === 0
        ? 'Synced 0 items — no accessible data found'
        : knowledgeCreated + knowledgeUpdated === 0
          ? 'Synced 0 items — no extractable knowledge found'
          : undefined,
    })
  } catch (err) {
    console.error('[notion/sync]', err)
    return NextResponse.json({
      success: false,
      fetched: 0,
      processed: 0,
      knowledgeCreated: 0,
      knowledgeUpdated: 0,
      skipped: 0,
      extracted: 0,
      error: err instanceof Error ? err.message : 'Sync failed',
    }, { status: 500 })
  }
}
