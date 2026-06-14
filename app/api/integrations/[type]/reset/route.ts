import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteEmbeddings } from '@/lib/pinecone'
import { trackEvent } from '@/lib/activity'

const ALLOWED_TYPES = new Set(['slack', 'notion', 'linear'])
const ALLOWED_ROLES = new Set(['owner', 'admin'])

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ type: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type } = await context.params
  if (!ALLOWED_TYPES.has(type)) return NextResponse.json({ error: 'Unsupported integration' }, { status: 400 })

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
    where: { workspaceId_type: { workspaceId, type } },
    select: { id: true },
  })
  if (!integration) return NextResponse.json({ error: `${type} is not connected` }, { status: 404 })

  const knowledgeItems = await prisma.knowledgeItem.findMany({
    where: { workspaceId, source: type },
    select: { id: true, embeddingId: true },
  })
  const vectorIds = knowledgeItems.map((item) => item.embeddingId ?? item.id)

  let pagesDeleted = 0
  let chunksDeleted = 0
  if (type === 'notion') {
    const chunks = await prisma.notionChunk.findMany({
      where: { workspaceId },
      select: { pineconeId: true },
    })
    vectorIds.push(...chunks.flatMap((chunk) => chunk.pineconeId ? [chunk.pineconeId] : []))
    chunksDeleted = chunks.length
  }

  await deleteEmbeddings([...new Set(vectorIds)])
  const deletedKnowledge = await prisma.knowledgeItem.deleteMany({ where: { workspaceId, source: type } })

  if (type === 'notion') {
    const deletedPages = await prisma.notionPage.deleteMany({ where: { workspaceId } })
    pagesDeleted = deletedPages.count
  }

  if (type === 'notion') {
    await prisma.integration.delete({ where: { id: integration.id } })
  } else {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: null },
    })
  }
  await prisma.syncStatus.updateMany({
    where: { workspaceId, integration: type },
    data: {
      lastSyncAt: null,
      nextSyncAt: null,
      errorMessage: null,
      ...(type === 'notion' ? { status: 'paused' } : {}),
    },
  })

  await trackEvent(workspaceId, userId, member.displayName, 'sync', `Reset ${type} data`, {
    integration: type,
    action: 'reset',
    knowledgeItemsDeleted: deletedKnowledge.count,
    pagesDeleted,
    chunksDeleted,
  })

  return NextResponse.json({
    success: true,
    integration: type,
    deleted: deletedKnowledge.count,
    pagesDeleted,
    chunksDeleted,
  })
}
