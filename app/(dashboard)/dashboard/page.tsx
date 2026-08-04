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
  if (!user?.workspace) redirect('/setup')
  const workspaceId = user.workspace.id
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1)
  const visibleKnowledge = {
    workspaceId,
    OR: [
      { visibility: 'team' },
      { visibility: 'personal', visibilitySetBy: userId },
    ],
  }
  const archivedKnowledge = {
    OR: [
      { sourceMetadata: { path: ['knowledgeStatus'], equals: 'archived' } },
      { sourceMetadata: { path: ['archived'], equals: true } },
    ],
  }
  const ruleKnowledge = {
    OR: [
      { category: { in: ['rule', 'rules'], mode: 'insensitive' as const } },
      { sourceMetadata: { path: ['knowledgeType'], equals: 'rule' } },
      { sourceMetadata: { path: ['knowledgeType'], equals: 'rules' } },
      { sourceMetadata: { path: ['type'], equals: 'rule' } },
      { sourceMetadata: { path: ['type'], equals: 'rules' } },
    ],
  }

  const [active, suggested, dueToday, overdue, decisions, visibleKnowledgeCount, archivedKnowledgeCount, rules, integrations, connectors, syncErrors, suggestedTasks, dueTasks, recentDecisions] = await Promise.all([
    prisma.task.count({ where: { workspaceId, status: 'active' } }),
    prisma.task.count({ where: { workspaceId, status: 'suggested' } }),
    prisma.task.count({ where: { workspaceId, status: 'active', dueAt: { gte: todayStart, lt: tomorrow } } }),
    prisma.task.count({ where: { workspaceId, status: 'active', dueAt: { lt: now } } }),
    prisma.decision.count({ where: { workspaceId } }),
    prisma.knowledgeItem.count({ where: visibleKnowledge }),
    prisma.knowledgeItem.count({ where: { AND: [visibleKnowledge, archivedKnowledge] } }),
    prisma.knowledgeItem.count({ where: { AND: [visibleKnowledge, ruleKnowledge, { NOT: archivedKnowledge }] } }),
    prisma.integration.findMany({ where: { workspaceId }, select: { id: true, type: true, accessToken: true, metadata: true, lastSyncAt: true } }),
    prisma.apiConnector.findMany({ where: { workspaceId }, select: { id: true, sourceKey: true, status: true, lastSyncAt: true } }),
    prisma.syncStatus.count({ where: { workspaceId, status: 'error' } }),
    prisma.task.findMany({
      where: { workspaceId, status: 'suggested' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, title: true, sourceType: true, dueAt: true, priority: true },
    }),
    prisma.task.findMany({
      where: { workspaceId, status: 'active', dueAt: { lt: tomorrow } },
      orderBy: { dueAt: 'asc' },
      take: 20,
      select: { id: true, title: true, sourceType: true, dueAt: true, priority: true },
    }),
    prisma.decision.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, title: true, source: true, madeAt: true, createdAt: true },
    }),
  ])

  const connectedIntegrationRows = integrations.filter(integration => isIntegrationConnected(integration))
  const connectedConnectorRows = connectors.filter(connector => connector.status === 'connected')
  const connectedIntegrations = connectedIntegrationRows.length + connectedConnectorRows.length
  const connectorErrors = connectors.filter(connector => connector.status === 'sync_error').length
  const disconnectedIntegrations = integrations.filter(integration => !isIntegrationConnected(integration)).length
  const integrationErrors = syncErrors + connectorErrors + disconnectedIntegrations
  const savedContext = Math.max(0, visibleKnowledgeCount - archivedKnowledgeCount)
  const representedIntegrations = new Set([
    ...integrations.map(integration => integration.type.toLowerCase()),
    ...connectors.map(connector => connector.sourceKey.toLowerCase()),
  ])
  const health: Array<{ name: string; status: 'Connected' | 'Needs attention' | 'Upcoming'; lastSyncAt: string | null }> = [
    ...integrations.map(item => ({
      name: item.type,
      status: isIntegrationConnected(item) ? 'Connected' as const : 'Needs attention' as const,
      lastSyncAt: item.lastSyncAt?.toISOString() ?? null,
    })),
    ...connectors.map(item => ({
      name: item.sourceKey,
      status: item.status === 'connected' ? 'Connected' as const : 'Needs attention' as const,
      lastSyncAt: item.lastSyncAt?.toISOString() ?? null,
    })),
    ...(!representedIntegrations.has('gmail') ? [{ name: 'gmail', status: 'Upcoming' as const, lastSyncAt: null }] : []),
    ...(!representedIntegrations.has('teams') && !representedIntegrations.has('microsoft_teams') ? [{ name: 'microsoft_teams', status: 'Upcoming' as const, lastSyncAt: null }] : []),
  ]
  const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
  const priorityTasks = dueTasks
    .sort((a, b) => (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4)
      || (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0))
    .slice(0, 3)

  return <DashboardOverview data={{
    counts: {
      active,
      suggested,
      decisions,
      connectedIntegrations,
      savedContext,
      rules,
      dueToday,
      overdue,
      upcomingIntegrations: health.filter(item => item.status === 'Upcoming').length,
      integrationErrors,
    },
    suggestedTasks: suggestedTasks.map(task => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null })),
    priorityTasks: priorityTasks.map(task => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null })),
    recentDecisions: recentDecisions.map(decision => ({
      id: decision.id,
      title: decision.title,
      source: decision.source,
      status: 'Remembered',
      date: (decision.madeAt ?? decision.createdAt).toISOString(),
    })),
    health,
  }} />
}
