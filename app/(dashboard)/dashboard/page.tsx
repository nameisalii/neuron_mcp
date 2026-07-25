import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { isIntegrationConnected } from '@/lib/integrations/connection'
import DashboardOverview from './DashboardOverview'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { workspace: { select: { id: true } } } })
  if (!user?.workspace) redirect('/onboarding')
  const workspaceId = user.workspace.id
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1)

  const [active, suggested, dueToday, overdue, decisions, savedContext, integrations, connectors, syncErrors, suggestedTasks, priorityTasks, recentDecisions, sourcedAnswers] = await Promise.all([
    prisma.task.count({ where: { workspaceId, status: 'active' } }),
    prisma.task.count({ where: { workspaceId, status: 'suggested' } }),
    prisma.task.count({ where: { workspaceId, status: 'active', dueAt: { gte: todayStart, lt: tomorrow } } }),
    prisma.task.count({ where: { workspaceId, status: 'active', dueAt: { lt: now } } }),
    prisma.decision.count({ where: { workspaceId } }),
    prisma.knowledgeItem.count({ where: { workspaceId } }),
    prisma.integration.findMany({ where: { workspaceId }, select: { id: true, type: true, accessToken: true, metadata: true, lastSyncAt: true } }),
    prisma.apiConnector.findMany({ where: { workspaceId }, select: { id: true, sourceKey: true, status: true, lastSyncAt: true } }),
    prisma.syncStatus.count({ where: { workspaceId, status: 'error' } }),
    prisma.task.findMany({ where: { workspaceId, status: 'suggested' }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, title: true, sourceType: true, dueAt: true, priority: true } }),
    prisma.task.findMany({ where: { workspaceId, status: 'active', dueAt: { lt: tomorrow } }, orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }], take: 3, select: { id: true, title: true, sourceType: true, dueAt: true, priority: true, status: true } }),
    prisma.decision.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, title: true, source: true, madeAt: true, createdAt: true } }),
    prisma.activityEvent.count({ where: { workspaceId, eventType: 'onboarding_question_answered' } }),
  ])

  const connectedIntegrations = integrations.filter(integration => isIntegrationConnected(integration)).length
    + connectors.filter(connector => connector.status === 'connected').length
  const connectorErrors = connectors.filter(connector => connector.status === 'sync_error').length
  const needsAttention = syncErrors + connectorErrors
  const health = [
    ...integrations.map(item => ({ name: item.type, status: isIntegrationConnected(item) ? 'Healthy' : 'Needs attention', lastSyncAt: item.lastSyncAt?.toISOString() ?? null })),
    ...connectors.map(item => ({ name: item.sourceKey, status: item.status === 'connected' ? 'Healthy' : item.status === 'sync_error' ? 'Needs attention' : 'Setup needed', lastSyncAt: item.lastSyncAt?.toISOString() ?? null })),
    { name: 'gmail', status: 'Upcoming', lastSyncAt: null }, { name: 'teams', status: 'Upcoming', lastSyncAt: null },
  ]

  return <DashboardOverview data={{
    counts: { active, suggested, decisions, connectedIntegrations, needsAttention, savedContext, dueToday, overdue, sourcedAnswers },
    suggestedTasks: suggestedTasks.map(task => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null })),
    priorityTasks: priorityTasks.map(task => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null })),
    recentDecisions: recentDecisions.map(decision => ({ ...decision, date: (decision.madeAt ?? decision.createdAt).toISOString() })),
    health,
  }} />
}
