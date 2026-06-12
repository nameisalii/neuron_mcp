import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Brain, GitBranch, Lightbulb, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { clsx } from 'clsx'
import SyncButton from './integrations/SyncButton'
import CopyContextButton from './CopyContextButton'
import Link from 'next/link'

const CATEGORY_COLORS: Record<string, string> = {
  rule: 'bg-blue-100 text-blue-700',
  decision: 'bg-purple-100 text-purple-700',
  process: 'bg-amber-100 text-amber-700',
  idea: 'bg-emerald-100 text-emerald-700',
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString()
}

function formatSyncTime(date: Date | null): string {
  if (!date) return 'Never'
  return timeAgo(date)
}

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })

  if (!user?.workspace) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-gray-500 mt-2 text-sm">Setting up your workspace…</p>
      </div>
    )
  }

  const workspaceId = user.workspace.id

  const [knowledgeCount, decisionCount, ideaCount, frozenCount, slackIntegration, recentItems] =
    await Promise.all([
      prisma.knowledgeItem.count({ where: { workspaceId } }),
      prisma.decision.count({ where: { workspaceId } }),
      prisma.idea.count({ where: { workspaceId } }),
      prisma.knowledgeItem.count({ where: { workspaceId, frozen: true } }),
      prisma.integration.findFirst({
        where: { workspaceId, type: 'slack' },
        select: { lastSyncAt: true },
      }),
      prisma.knowledgeItem.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, content: true, category: true, source: true, createdAt: true },
      }),
    ])

  const stats = [
    {
      label: 'Knowledge Items',
      value: knowledgeCount,
      icon: Brain,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Decisions',
      value: decisionCount,
      icon: GitBranch,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Ideas',
      value: ideaCount,
      icon: Lightbulb,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Last Sync',
      value: formatSyncTime(slackIntegration?.lastSyncAt ?? null),
      icon: Clock,
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      isText: true,
    },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="text-gray-500 text-sm mt-1">Your company&apos;s collective intelligence.</p>
        </div>
        <div className="flex items-center gap-2">
          <CopyContextButton />
          <SyncButton endpoint="/api/integrations/slack/sync" showReset resultLabel="messages" />
        </div>
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

      {frozenCount > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <span className="text-amber-800">
            ⚠ {frozenCount} conflict{frozenCount !== 1 ? 's' : ''} detected — two sources disagree.
          </span>
          <Link
            href="/dashboard/brain?filter=conflicts"
            className="text-amber-700 font-semibold hover:text-amber-900 transition-colors"
          >
            Review in Brain →
          </Link>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h2>
        {recentItems.length === 0 ? (
          <Card padding="md" className="text-center text-gray-500 text-sm">
            No knowledge captured yet. Connect Slack and run a sync.
          </Card>
        ) : (
          <div className="space-y-2">
            {recentItems.map((item) => (
              <Card key={item.id} padding="sm">
                <div className="flex items-start gap-3">
                  <span
                    className={clsx(
                      'inline-flex px-2 py-0.5 rounded text-xs font-medium shrink-0',
                      CATEGORY_COLORS[item.category] ?? 'bg-gray-100 text-gray-700'
                    )}
                  >
                    {item.category}
                  </span>
                  <p className="text-sm text-gray-800 flex-1 truncate">
                    {item.content.slice(0, 60)}
                    {item.content.length > 60 && '…'}
                  </p>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-gray-400">{item.source}</p>
                    <p className="text-xs text-gray-400">{timeAgo(item.createdAt)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
