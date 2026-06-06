import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import QueryClient from './QueryClient'
import type { WorkspaceType } from '@/types'

export default async function QueryPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) redirect('/dashboard')

  const { id: workspaceId } = user.workspace

  const [workspace, queryLogs] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { type: true },
    }),
    prisma.queryLog.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, query: true, createdAt: true },
    }),
  ])

  const workspaceType = (workspace?.type ?? 'solo') as WorkspaceType

  const recentQueries = queryLogs.map((q) => ({
    ...q,
    createdAt: q.createdAt.toISOString(),
  }))

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Ask your Brain</h1>
      <QueryClient workspaceType={workspaceType} recentQueries={recentQueries} />
    </div>
  )
}
