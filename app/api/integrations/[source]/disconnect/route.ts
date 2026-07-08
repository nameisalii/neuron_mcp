import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { trackEvent } from '@/lib/activity'
import { deleteEmbeddings } from '@/lib/pinecone'

const ALLOWED_TYPES = new Set([
  'slack',
  'notion',
  'gmail',
  'linear',
  'discord',
  'telegram',
  'granola',
  'jira',
  'whatsapp',
  'datatruck',
  'teams',
])

const WEBHOOK_BINDING_TYPES = new Set(['discord', 'telegram', 'whatsapp', 'teams'])

export async function POST(
  req: Request,
  context: { params: Promise<{ source: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  const { source: type } = await context.params
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: 'Unsupported integration' }, { status: 400 })
  }

  let deleteKnowledgeItems = false
  try {
    const body = (await req.json()) as { deleteKnowledgeItems?: unknown } | null
    deleteKnowledgeItems = Boolean(body && body.deleteKnowledgeItems)
  } catch {
    deleteKnowledgeItems = false
  }

  const result = await prisma.$transaction(async (tx) => {
    const disconnected = type === 'datatruck'
      ? await tx.apiConnector.deleteMany({
        where: { workspaceId: workspace.workspaceId, sourceKey: 'datatruck' },
      })
      : await tx.integration.deleteMany({
        where: { workspaceId: workspace.workspaceId, type },
      })

    await tx.syncStatus.updateMany({
      where: { workspaceId: workspace.workspaceId, integration: type },
      data: {
        lastSyncAt: null,
        nextSyncAt: null,
        status: 'paused',
        errorMessage: null,
      },
    })

    return { disconnectedCount: disconnected.count, deletedKnowledgeCount: 0, deletedDocumentCount: 0 }
  })

  const warnings: string[] = []
  if (deleteKnowledgeItems) {
    try {
      const knowledgeItems = await prisma.knowledgeItem.findMany({
        where: { workspaceId: workspace.workspaceId, source: type },
        select: { id: true, embeddingId: true },
      })
      const knowledgeVectorIds = knowledgeItems.map((item) => item.embeddingId ?? item.id)
      if (knowledgeVectorIds.length > 0) {
        await deleteEmbeddings([...new Set(knowledgeVectorIds)])
      }
    } catch (err) {
      console.error('[integrations/disconnect] embedding cleanup failed', err instanceof Error ? err.message : 'unknown error')
      warnings.push('Imported knowledge could not be fully removed from search indexes.')
    }

    try {
      const deletedKnowledgeCount = (await prisma.knowledgeItem.deleteMany({
        where: { workspaceId: workspace.workspaceId, source: type },
      })).count
      const deletedDocumentCount = (await prisma.documentAttachment.deleteMany({
        where: { workspaceId: workspace.workspaceId, source: type },
      })).count
      result.deletedKnowledgeCount = deletedKnowledgeCount
      result.deletedDocumentCount = deletedDocumentCount
    } catch (err) {
      console.error('[integrations/disconnect] knowledge cleanup failed', err instanceof Error ? err.message : 'unknown error')
      warnings.push('Imported knowledge could not be fully removed.')
    }
  }

  await trackEvent(
    workspace.workspaceId,
    userId,
    workspace.member.displayName,
    'sync',
    `Disconnected ${type}`,
    {
      integration: type,
      action: 'disconnect',
      removedConnectionRecords: result.disconnectedCount,
      removedKnowledgeItems: result.deletedKnowledgeCount,
      removedDocumentAttachments: result.deletedDocumentCount,
      removedWebhookBindings: WEBHOOK_BINDING_TYPES.has(type),
    },
  ).catch(() => null)

  return NextResponse.json({
    success: true,
    integration: type,
    disconnected: true,
    removedConnectionRecords: result.disconnectedCount,
    removedKnowledgeItems: result.deletedKnowledgeCount,
    removedDocumentAttachments: result.deletedDocumentCount,
    removedWebhookBindings: WEBHOOK_BINDING_TYPES.has(type),
    warnings,
  })
}
