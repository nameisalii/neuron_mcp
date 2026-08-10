import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { buildKnowledgeGraph } from '@/lib/knowledge/graph'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
  const workspaceId = user.workspace.id

  const [items, tasks, decisions] = await Promise.all([
    prisma.knowledgeItem.findMany({
      where: {
        workspaceId,
        OR: [
          { visibility: 'team' },
          { visibility: 'personal', visibilitySetBy: userId },
        ],
        NOT: [
          { sourceMetadata: { path: ['knowledgeStatus'], equals: 'archived' } },
          { sourceMetadata: { path: ['archived'], equals: true } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 5000,
      select: {
        id: true,
        content: true,
        summary: true,
        reason: true,
        label: true,
        category: true,
        source: true,
        sourceExternalId: true,
        sourceMetadata: true,
        createdAt: true,
        updatedAt: true,
        verified: true,
        confidence: true,
      },
    }),
    prisma.task.findMany({
      where: { workspaceId, status: { not: 'archived' } },
      select: { id: true, extractedFromKnowledgeItemId: true, sourceType: true, title: true },
    }),
    prisma.decision.findMany({
      where: { workspaceId },
      select: { id: true, source: true, title: true, decision: true },
    }),
  ])

  return NextResponse.json(buildKnowledgeGraph(items, tasks, decisions))
}
