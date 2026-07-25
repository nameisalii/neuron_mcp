import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import TasksClient from './TasksClient'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { workspace: { select: { id: true } } } })
  if (!user?.workspace) redirect('/onboarding')
  const tasks = await prisma.task.findMany({ where: { workspaceId: user.workspace.id }, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }] })
  return <TasksClient initialTasks={tasks.map((task) => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null, completedAt: task.completedAt?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() }))} />
}
