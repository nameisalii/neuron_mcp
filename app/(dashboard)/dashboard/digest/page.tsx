import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import DigestClient from './DigestClient'

export default async function DigestPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) redirect('/dashboard')
  const { id: workspaceId } = user.workspace

  const [digests, unreadAlerts] = await Promise.all([
    prisma.digest.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.alert.count({ where: { workspaceId, status: 'unread' } }),
  ])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Morning Digest</h1>
        <p className="text-sm text-gray-500 mt-1">Your personalised daily and weekly knowledge summaries.</p>
      </div>
      <DigestClient
        digests={digests.map((d) => ({
          ...d,
          date: d.date.toISOString(),
          deliveredAt: d.deliveredAt?.toISOString() ?? null,
          readAt: d.readAt?.toISOString() ?? null,
          createdAt: d.createdAt.toISOString(),
        }))}
        unreadAlerts={unreadAlerts}
      />
    </div>
  )
}
