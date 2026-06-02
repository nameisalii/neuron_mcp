import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import IdeasGrid from './IdeasGrid'

export default async function IdeasPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })

  const ideas = user?.workspace
    ? await prisma.knowledgeItem.findMany({
        where: { workspaceId: user.workspace.id, category: 'idea' },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          content: true,
          source: true,
          verifiedAt: true,
          createdAt: true,
        },
      })
    : []

  const serialized = ideas.map((item) => ({
    id: item.id,
    content: item.content,
    source: item.source,
    relatedIds: [] as string[],
    actionedAt: item.verifiedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  }))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ideas</h1>
        <p className="text-gray-500 text-sm mt-1">
          Sparks and &ldquo;what if&rdquo;s captured from your team.
        </p>
      </div>
      <IdeasGrid ideas={serialized} />
    </div>
  )
}
