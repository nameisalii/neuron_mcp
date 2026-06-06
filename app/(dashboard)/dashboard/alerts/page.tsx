import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import AlertsClient from './AlertsClient'

export default async function AlertsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) redirect('/dashboard')
  const { id: workspaceId } = user.workspace

  const [alerts, members] = await Promise.all([
    prisma.alert.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true, displayName: true },
    }),
  ])

  const memberMap: Record<string, string> = {}
  for (const m of members) memberMap[m.userId] = m.displayName

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
        <p className="text-sm text-gray-500 mt-1">Conflicts, stale knowledge, and important flags.</p>
      </div>
      <AlertsClient
        alerts={alerts.map((a) => ({
          ...a,
          sourceChunkIds: a.sourceChunkIds as string[],
          resolvedAt: a.resolvedAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
        }))}
        memberMap={memberMap}
        currentUserId={userId}
      />
    </div>
  )
}
