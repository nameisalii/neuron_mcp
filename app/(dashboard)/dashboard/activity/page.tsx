import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import ActivityFeedClient from './ActivityFeedClient'

export default async function ActivityPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true, type: true } } },
  })
  if (!user?.workspace) redirect('/dashboard')
  const { id: workspaceId, type: workspaceType } = user.workspace

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: 'active' },
    select: { userId: true, displayName: true },
    orderBy: { displayName: 'asc' },
  })

  return (
    <ActivityFeedClient
      workspaceId={workspaceId}
      workspaceType={workspaceType}
      members={members}
      currentUserId={userId}
    />
  )
}
