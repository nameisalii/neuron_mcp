import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import QueryClient from './QueryClient'
import type { WorkspaceType } from '@/types'

export default async function QueryPage({
  searchParams,
}: {
  searchParams?: Promise<{ conversationId?: string | string[]; taskId?: string | string[]; q?: string | string[] }>
}) {
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
      take: 20,
      select: { id: true, query: true, createdAt: true },
    }),
  ])

  const workspaceType = (workspace?.type ?? 'solo') as WorkspaceType

  const recentQueries = queryLogs.map((q) => ({
    ...q,
    createdAt: q.createdAt.toISOString(),
  }))
  const params = searchParams ? await searchParams : {}
  const initialConversationId = typeof params.conversationId === 'string' ? params.conversationId : null
  const taskId = typeof params.taskId === 'string' ? params.taskId : null
  const task = taskId ? await prisma.task.findFirst({
    where: { id: taskId, workspaceId, status: { not: 'archived' } },
    select: { title: true, description: true, sourceSnippet: true },
  }) : null
  const taskContext = task
    ? `Help me with this task: ${task.title}. Context: ${task.description || task.sourceSnippet || 'No additional context provided.'}`
    : ''
  const questionContext = typeof params.q === 'string' ? params.q.slice(0, 1000) : ''

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-0 w-full flex-col gap-4 overflow-hidden lg:h-[calc(100dvh-4rem)]">
      <h1 className="text-2xl font-bold text-gray-900">Chat</h1>
      <QueryClient workspaceType={workspaceType} recentQueries={recentQueries} initialConversationId={initialConversationId} initialPrompt={taskContext || questionContext} />
    </div>
  )
}
