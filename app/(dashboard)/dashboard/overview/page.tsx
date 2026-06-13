import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Brain, GitBranch, Lightbulb, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { clsx } from 'clsx'
import BrainGrid from '../brain/BrainGrid'

const FILTER_MAP = {
  all: null,
  rules: 'rule',
  decisions: 'decision',
  processes: 'process',
  ideas: 'idea',
  facts: 'fact',
} as const

type OverviewFilter = keyof typeof FILTER_MAP

function timeAgo(date: Date | null): string {
  if (!date) return 'Never'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString()
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const requestedFilter = (await searchParams).filter ?? 'all'
  const filter: OverviewFilter = requestedFilter in FILTER_MAP ? requestedFilter as OverviewFilter : 'all'
  const category = FILTER_MAP[filter]

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) redirect('/onboarding')
  const workspaceId = user.workspace.id
  const visibleKnowledge = {
    workspaceId,
    OR: [
      { visibility: 'team' },
      { visibility: 'personal', visibilitySetBy: userId },
    ],
  }

  const [knowledgeCount, decisionCount, ideaCount, latestIntegration, items] = await Promise.all([
    prisma.knowledgeItem.count({ where: visibleKnowledge }),
    prisma.knowledgeItem.count({ where: { ...visibleKnowledge, category: 'decision' } }),
    prisma.knowledgeItem.count({ where: { ...visibleKnowledge, category: 'idea' } }),
    prisma.integration.findFirst({
      where: { workspaceId, lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: 'desc' },
      select: { lastSyncAt: true },
    }),
    prisma.knowledgeItem.findMany({
      where: { ...visibleKnowledge, ...(category ? { category } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, content: true, category: true, source: true, confidence: true,
        verified: true, verifiedAt: true, frozen: true, conflictNote: true, createdAt: true,
        sourceUrl: true, sourceExternalId: true, owner: true, sourceCreatedAt: true,
        updatedAt: true, notionPageTitle: true,
      },
    }),
  ])

  const stats = [
    { label: 'Knowledge Items', value: knowledgeCount, icon: Brain, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Decisions', value: decisionCount, icon: GitBranch, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Ideas', value: ideaCount, icon: Lightbulb, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Last Sync', value: timeAgo(latestIntegration?.lastSyncAt ?? null), icon: Clock, color: 'text-gray-600', bg: 'bg-gray-50', isText: true },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-gray-500 text-sm mt-1">Your company&apos;s collective intelligence.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} padding="sm">
            <div className={clsx('w-8 h-8 rounded-md flex items-center justify-center mb-3', stat.bg)}>
              <stat.icon className={clsx('w-4 h-4', stat.color)} />
            </div>
            <p className={clsx('font-bold', stat.isText ? 'text-lg text-gray-700' : 'text-2xl text-gray-900')}>
              {stat.value}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </Card>
        ))}
      </div>

      <BrainGrid
        activeFilter={filter}
        items={items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          verifiedAt: item.verifiedAt?.toISOString() ?? null,
          sourceCreatedAt: item.sourceCreatedAt?.toISOString() ?? null,
          updatedAt: item.updatedAt.toISOString(),
        }))}
      />
    </div>
  )
}
