import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getBrainActivityAnalytics } from '@/lib/activity/analytics'
import ActivityFeedClient from './ActivityFeedClient'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ActivityPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true, name: true, type: true, createdAt: true } } },
  })
  if (!user?.workspace) redirect('/dashboard')
  const { id: workspaceId, type: workspaceType } = user.workspace

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: 'active' },
    select: { userId: true, displayName: true, avatarUrl: true },
    orderBy: { displayName: 'asc' },
  })

  const analytics = await getBrainActivityAnalytics(workspaceId, members)
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)
  const queryTypes = ['query']
  const [lastQuery, lastActivity, totalQueries, queries7, queries30, decisionsSaved, saveDecisionEvents, tasksCreated, integrationsConnected, sourcedAnswers] = await Promise.all([
    prisma.activityEvent.findFirst({ where: { workspaceId, eventType: { in: queryTypes } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.activityEvent.findFirst({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.activityEvent.count({ where: { workspaceId, eventType: { in: queryTypes } } }),
    prisma.activityEvent.count({ where: { workspaceId, eventType: { in: queryTypes }, createdAt: { gte: sevenDaysAgo } } }),
    prisma.activityEvent.count({ where: { workspaceId, eventType: { in: queryTypes }, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.decision.count({ where: { workspaceId } }),
    prisma.activityEvent.count({ where: { workspaceId, eventType: 'save_decision' } }),
    prisma.task.count({ where: { workspaceId } }),
    prisma.integration.count({ where: { workspaceId } }),
    prisma.activityEvent.count({ where: { workspaceId, eventType: 'onboarding_question_answered' } }),
  ])
  const activityByValidationWeek = await Promise.all([1, 2, 4].map(async (week) => {
    const start = new Date(user.workspace!.createdAt.getTime() + (week - 1) * 7 * 86_400_000)
    const end = new Date(start.getTime() + 7 * 86_400_000)
    const count = await prisma.activityEvent.count({ where: { workspaceId, createdAt: { gte: start, lt: end } } })
    return { week, count, available: now >= start }
  }))

  return (
    <div className="space-y-7">
      {process.env.SHOW_VALIDATION_SIGNALS === 'true' && <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="validation-signals-title">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 id="validation-signals-title" className="text-xl font-semibold text-gray-950">Validation signals</h1><p className="mt-1 text-sm text-gray-500">Shows whether this workspace is coming back and using Neuron without being pushed.</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">{user.workspace.name || 'Current workspace'}</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Signal label="Last query" value={lastQuery ? lastQuery.createdAt.toLocaleDateString() : 'No query events yet.'}/>
          <Signal label="Last activity" value={lastActivity ? lastActivity.createdAt.toLocaleDateString() : 'No activity yet.'}/>
          <Signal label="Queries" value={`${totalQueries} total · ${queries7} in 7d · ${queries30} in 30d`}/>
          <Signal label="Decisions saved" value={decisionsSaved ? `${decisionsSaved} saved · ${saveDecisionEvents} events` : 'No decisions saved yet.'}/>
          <Signal label="Tasks created" value={String(tasksCreated)}/>
          <Signal label="Integrations connected" value={String(integrationsConnected)}/>
          <Signal label="3-question setup" value={`${Math.min(sourcedAnswers, 3)}/3 sourced answers`}/>
          <Signal label="Retention weeks" value={activityByValidationWeek.map(item => `W${item.week}: ${item.available ? item.count : '—'}`).join(' · ')}/>
        </div>
        <Link href="/dashboard/query" className="mt-4 inline-flex text-sm font-medium text-indigo-600">Ask a real company question →</Link>
      </section>}
      <ActivityFeedClient workspaceId={workspaceId} workspaceType={workspaceType} members={members} currentUserId={userId} analytics={analytics}/>
    </div>
  )
}

function Signal({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-gray-50 px-4 py-3"><p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p><p className="mt-1.5 text-sm font-semibold text-gray-800">{value}</p></div>
}
