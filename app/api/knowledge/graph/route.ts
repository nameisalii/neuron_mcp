import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { knowledgeRequestContext } from '@/lib/knowledge/api'
import { buildKnowledgeGraph } from '@/lib/knowledge/graph'

export async function GET() {
  const context = await knowledgeRequestContext()
  if (context.response) return context.response
  const workspaceId = context.workspaceId!

  const [items, tasks, decisions] = await Promise.all([
    prisma.knowledgeItem.findMany({
      where: {
        workspaceId,
        OR: [
          { visibility: 'team' },
          { visibility: 'personal', visibilitySetBy: context.userId },
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
