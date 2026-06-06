import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import OverviewClient from './OverviewClient'

export default async function KnowledgeOverviewPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true, type: true } } },
  })
  if (!user?.workspace) redirect('/dashboard')
  const { id: workspaceId, type: workspaceType } = user.workspace

  const [chunks, recentActivity] = await Promise.all([
    prisma.notionChunk.findMany({
      where: {
        workspaceId,
        OR: [
          { visibility: 'team' },
          { visibility: 'personal', visibilitySetBy: userId },
        ],
      },
      select: {
        id: true,
        content: true,
        labels: true,
        labeledBy: true,
        visibility: true,
        createdAt: true,
        page: { select: { id: true, title: true } },
      },
    }),
    prisma.activityEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, displayName: true, description: true, eventType: true, createdAt: true },
    }),
  ])

  const labeledChunks = chunks.filter((c) => {
    const labels = c.labels as string[]
    return Array.isArray(labels) && labels.length > 0
  })

  const labelCounts: Record<string, number> = {}
  labeledChunks.forEach((c) => {
    for (const l of c.labels as string[]) {
      labelCounts[l] = (labelCounts[l] ?? 0) + 1
    }
  })

  const chunksByLabel: Record<string, Array<{
    id: string
    content: string
    pageId: string
    pageTitle: string
    labeledBy: unknown
    visibility: string
    createdAt: string
  }>> = {}

  labeledChunks.forEach((c) => {
    for (const label of c.labels as string[]) {
      if (!chunksByLabel[label]) chunksByLabel[label] = []
      chunksByLabel[label].push({
        id: c.id,
        content: c.content,
        pageId: c.page.id,
        pageTitle: c.page.title,
        labeledBy: c.labeledBy,
        visibility: c.visibility,
        createdAt: c.createdAt.toISOString(),
      })
    }
  })

  return (
    <OverviewClient
      labelCounts={labelCounts}
      chunksByLabel={chunksByLabel}
      totalChunks={chunks.length}
      labeledCount={labeledChunks.length}
      recentActivity={recentActivity.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        description: a.description,
        eventType: a.eventType,
        createdAt: a.createdAt.toISOString(),
      }))}
      workspaceType={workspaceType}
    />
  )
}
