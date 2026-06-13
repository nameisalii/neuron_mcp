import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteEmbeddingsInNamespace } from '@/lib/pinecone'
import { trackEvent } from '@/lib/activity'
import { DEFAULT_GMAIL_LABEL_NAMES, DEFAULT_GMAIL_LABELS, getGmailNamespace } from '@/lib/gmail/config'

const ALLOWED_ROLES = new Set(['owner', 'admin'])

export async function POST() {
  try {
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
      where: { workspaceId_type: { workspaceId, type: 'gmail' } },
      select: { metadata: true },
    })
    if (!integration) return NextResponse.json({ error: 'Gmail is not connected' }, { status: 404 })

    const namespace = getGmailNamespace(workspaceId, userId)
    const threads = await prisma.emailThread.findMany({
      where: { workspaceId, syncedBy: userId },
      select: { id: true, gmailThreadId: true },
    })
    const threadIds = threads.map((thread) => thread.id)
    const gmailThreadIds = threads.map((thread) => thread.gmailThreadId)

    const [chunks, knowledgeItems] = await Promise.all([
      prisma.emailChunk.findMany({
        where: { workspaceId, emailThreadId: { in: threadIds } },
        select: { id: true, pineconeId: true },
      }),
      prisma.knowledgeItem.findMany({
        where: {
          workspaceId,
          source: 'gmail',
          visibilitySetBy: userId,
          sourceExternalId: { in: gmailThreadIds },
        },
        select: { id: true, embeddingId: true },
      }),
    ])

    const vectorIds = [
      ...chunks.flatMap((chunk) => chunk.pineconeId ? [chunk.pineconeId] : []),
      ...knowledgeItems.flatMap((item) => item.embeddingId ? [item.embeddingId] : [item.id]),
    ]
    await deleteEmbeddingsInNamespace([...new Set(vectorIds)], namespace)

    const deletedChunks = await prisma.emailChunk.deleteMany({
      where: { workspaceId, emailThreadId: { in: threadIds } },
    })
    const deletedThreads = await prisma.emailThread.deleteMany({
      where: { workspaceId, syncedBy: userId },
    })
    const deletedKnowledge = await prisma.knowledgeItem.deleteMany({
      where: { workspaceId, source: 'gmail', visibilitySetBy: userId, sourceExternalId: { in: gmailThreadIds } },
    })

    await prisma.integration.update({
      where: { workspaceId_type: { workspaceId, type: 'gmail' } },
      data: {
        lastSyncAt: null,
        metadata: {
          status: 'connected',
          configured: false,
          privacy: 'personal',
          selectedLabels: [...DEFAULT_GMAIL_LABELS],
          selectedLabelNames: [...DEFAULT_GMAIL_LABEL_NAMES],
          timeWindow: 30,
          syncFrom: null,
          senderFilter: [],
          excludeFilter: [],
          maxMessages: 200,
        },
      },
    })

    await prisma.syncStatus.upsert({
      where: { workspaceId_integration: { workspaceId, integration: 'gmail' } },
      create: {
        workspaceId,
        integration: 'gmail',
        mode: 'background',
        status: 'paused',
        configuredBy: userId,
        nextSyncAt: null,
      },
      update: {
        mode: 'background',
        status: 'paused',
        errorMessage: null,
        nextSyncAt: null,
      },
    })

    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Gmail reset completed', {
      integration: 'gmail',
      action: 'reset',
      threadsDeleted: deletedThreads.count,
      chunksDeleted: deletedChunks.count,
      knowledgeItemsDeleted: deletedKnowledge.count,
      vectorsDeleted: [...new Set(vectorIds)].length,
    })

    return NextResponse.json({
      success: true,
      deleted: deletedChunks.count + deletedThreads.count + deletedKnowledge.count,
      threadsDeleted: deletedThreads.count,
      chunksDeleted: deletedChunks.count,
      knowledgeItemsDeleted: deletedKnowledge.count,
      vectorsDeleted: [...new Set(vectorIds)].length,
    })
  } catch (err) {
    console.error('[gmail/reset]', err)
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
  }
}
