import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isIntegrationConnected } from '@/lib/integrations/connection'

const DAY_MS = 24 * 60 * 60 * 1000
const FEED_LIMIT = 30
const ACTIVITY_WINDOW_DAYS = 30
const CHART_WINDOW_DAYS = 7
const QUESTION_WINDOW_DAYS = 30
const MAX_TOP_ITEMS = 6
const EMPTY_NAME = 'Unknown user'

export interface ActivityAnalyticsMember {
  userId: string
  displayName: string
}

export interface ActivityFeedEvent {
  id: string
  userId: string
  displayName: string
  eventType: string
  description: string
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export interface ActivityDayStat {
  date: string
  label: string
  count: number
}

export interface ActivitySourceStat {
  source: string
  label: string
  count: number
}

export interface FrequentQuestionStat {
  key: string
  label: string
  preview: string
  count: number
  lastAskedAt: string
  conversationId: string | null
}

export interface ActiveUserStat {
  userId: string
  displayName: string
  count: number
  lastActiveAt: string
}

export interface AttentionStat {
  label: string
  description: string
  tone: 'warn' | 'danger'
  actionLabel?: string
  actionHref?: string
}

export interface IntegrationHealthStat {
  source: string
  label: string
  status: 'connected' | 'sync_warning' | 'needs_setup' | 'disconnected'
  statusLabel: string
  lastSyncAt: string | null
  itemCount: number
  documentCount: number
  href: string
}

export interface RecentKnowledgeStat {
  id: string
  title: string
  preview: string
  source: string
  sourceLabel: string
  category: string
  verified: boolean
  updatedAt: string
  href: string | null
}

export interface BrainActivityAnalytics {
  totals: {
    knowledgeItems: number
    questionsAsked: number
    documents: number
    activeSources: number
    activeUsers: number
    syncs: number
  }
  activityByDay: ActivityDayStat[]
  sources: ActivitySourceStat[]
  frequentQuestions: FrequentQuestionStat[]
  integrationHealth: IntegrationHealthStat[]
  recentKnowledge: RecentKnowledgeStat[]
  activeUsers: ActiveUserStat[]
  needsAttention: AttentionStat[]
  feed: {
    events: ActivityFeedEvent[]
    total: number
    page: number
    limit: number
  }
}

type ActivityEventRow = {
  id: string
  userId: string
  displayName: string
  eventType: string
  description: string
  metadata: Prisma.JsonValue | null
  createdAt: Date
}

type ChatMessageRow = {
  id: string
  conversationId: string
  userId: string | null
  content: string
  createdAt: Date
}

type KnowledgeItemRow = {
  id: string
  content: string
  source: string
  category: string
  verified: boolean
  updatedAt: Date
  sourceUrl: string | null
  sourceExternalId: string | null
  sourceMetadata: Prisma.JsonValue | null
  sourceCreatedAt: Date | null
}

type ConnectorRow = {
  sourceKey: string
  status: string
  lastSyncAt: Date | null
  metadata: Prisma.JsonValue | null
  encryptedCredential: string | null
}

type IntegrationRow = {
  type: string
  accessToken: string | null
  metadata: Prisma.JsonValue | null
  lastSyncAt: Date | null
}

type MemberLookup = Record<string, string>

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date)
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function shorten(value: string, limit: number): string {
  const text = normalizeWhitespace(value)
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function lower(value: string): string {
  return normalizeWhitespace(value).toLowerCase()
}

function formatSourceLabel(source: string): string {
  const normalized = source.toLowerCase()
  if (normalized === 'manual_upload') return 'Manual uploads'
  if (normalized === 'datatruck') return 'Datatruck'
  if (normalized === 'gmail') return 'Gmail'
  if (normalized === 'slack') return 'Slack'
  if (normalized === 'notion') return 'Notion'
  if (normalized === 'linear') return 'Linear'
  if (normalized === 'discord') return 'Discord'
  if (normalized === 'telegram') return 'Telegram'
  if (normalized === 'teams') return 'Teams'
  if (normalized === 'whatsapp') return 'WhatsApp'
  if (normalized === 'granola') return 'Granola'
  if (normalized === 'jira') return 'Jira'
  return source.charAt(0).toUpperCase() + source.slice(1)
}

function normalizeQuestion(question: string): string {
  return normalizeWhitespace(question).toLowerCase()
}

function countByDay(rows: Array<{ createdAt: Date }>, start: Date): ActivityDayStat[] {
  const days = Array.from({ length: CHART_WINDOW_DAYS }, (_, index) => addDays(start, index))
  const counts = new Map<string, number>(days.map((day) => [dayKey(day), 0]))
  for (const row of rows) {
    const key = dayKey(startOfDayUTC(row.createdAt))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return days.map((day) => ({
    date: dayKey(day),
    label: dayLabel(day),
    count: counts.get(dayKey(day)) ?? 0,
  }))
}

function buildMemberLookup(members: ActivityAnalyticsMember[]): MemberLookup {
  return Object.fromEntries(members.map((member) => [member.userId, member.displayName])) as MemberLookup
}

function eventToFeedRow(event: ActivityEventRow): ActivityFeedEvent {
  return {
    id: event.id,
    userId: event.userId,
    displayName: event.displayName,
    eventType: event.eventType,
    description: event.description,
    metadata: event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
      ? (event.metadata as Record<string, unknown>)
      : null,
    createdAt: event.createdAt.toISOString(),
  }
}

function summarizeQueryRow(row: ChatMessageRow): { key: string; label: string; preview: string } {
  const normalized = normalizeQuestion(row.content)
  return {
    key: normalized || row.id,
    label: shorten(row.content, 88),
    preview: shorten(row.content, 112),
  }
}

function integrationHealthStatusLabel(status: IntegrationHealthStat['status']): string {
  switch (status) {
    case 'connected':
      return 'Connected'
    case 'sync_warning':
      return 'Sync warning'
    case 'needs_setup':
      return 'Needs setup'
    case 'disconnected':
      return 'Disconnected'
  }
}

function safeMetadataRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function extractWarningCount(metadata: Prisma.JsonValue | null | undefined): number {
  const record = safeMetadataRecord(metadata)
  if (!record) return 0
  const summary = safeMetadataRecord(record.lastSyncSummary as Prisma.JsonValue | null | undefined)
  const warnings = summary?.warnings
  return Array.isArray(warnings) ? warnings.length : 0
}

function sourceKeyCounts(
  rows: Array<{ source: string; _count: { _all: number } }>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.source, (map.get(row.source) ?? 0) + row._count._all)
  }
  return map
}

function detectIntegrationStatus(
  source: string,
  integration: IntegrationRow | null | undefined,
  connector: ConnectorRow | null | undefined,
): IntegrationHealthStat['status'] {
  if (source === 'datatruck') {
    if (!connector || connector.status === 'not_configured') return 'needs_setup'
    if (connector.status === 'sync_error' || extractWarningCount(connector.metadata) > 0) return 'sync_warning'
    return 'connected'
  }

  if (source === 'telegram') {
    if (!integration?.accessToken?.trim()) return 'needs_setup'
    const metadata = safeMetadataRecord(integration.metadata)
    if (metadata?.status && typeof metadata.status === 'string') {
      const status = metadata.status.toLowerCase()
      if (status === 'disconnected' || status === 'error' || status === 'revoked') return 'disconnected'
    }
    return 'connected'
  }

  if (!integration) return 'needs_setup'
  if (!integration.accessToken?.trim()) return 'needs_setup'
  const metadata = safeMetadataRecord(integration.metadata)
  const status = typeof metadata?.status === 'string' ? metadata.status.toLowerCase() : null
  if (status === 'sync_error') return 'sync_warning'
  if (status === 'disconnected' || status === 'error' || status === 'revoked') return 'disconnected'
  return 'connected'
}

function buildKnowledgeHref(item: KnowledgeItemRow): string | null {
  if (item.sourceUrl) return item.sourceUrl
  if (item.source === 'notion' && item.sourceExternalId) {
    return `/dashboard/notion/${encodeURIComponent(item.sourceExternalId)}`
  }
  return `/dashboard/integrations/${encodeURIComponent(item.source)}`
}

export async function getBrainActivityAnalytics(
  workspaceId: string,
  members: ActivityAnalyticsMember[] = [],
): Promise<BrainActivityAnalytics> {
  const memberLookup = buildMemberLookup(members)
  const now = new Date()
  const chartStart = addDays(startOfDayUTC(now), -(CHART_WINDOW_DAYS - 1))
  const activityWindowStart = addDays(startOfDayUTC(now), -(ACTIVITY_WINDOW_DAYS - 1))
  const questionWindowStart = addDays(startOfDayUTC(now), -(QUESTION_WINDOW_DAYS - 1))

  const [
    knowledgeItems,
    documents,
    questionCount,
    syncCount,
    integrations,
    connectors,
    chartEvents,
    questionMessages,
    recentEvents,
    feedTotalCount,
    sourceCounts,
    documentSourceCounts,
    failedDocuments,
    unverifiedKnowledge,
    conflictCount,
  ] = await Promise.all([
    prisma.knowledgeItem.count({ where: { workspaceId } }),
    prisma.documentAttachment.count({ where: { workspaceId } }),
    prisma.activityEvent.count({ where: { workspaceId, eventType: 'query' } }),
    prisma.activityEvent.count({ where: { workspaceId, eventType: 'sync', createdAt: { gte: activityWindowStart } } }),
    prisma.integration.findMany({
      where: { workspaceId },
      select: { type: true, accessToken: true, metadata: true, lastSyncAt: true },
    }),
    prisma.apiConnector.findMany({
      where: { workspaceId },
      select: { sourceKey: true, status: true, metadata: true, encryptedCredential: true, lastSyncAt: true },
    }),
    prisma.activityEvent.findMany({
      where: { workspaceId, createdAt: { gte: chartStart } },
      select: {
        id: true,
        userId: true,
        displayName: true,
        eventType: true,
        description: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.chatMessage.findMany({
      where: { workspaceId, role: 'user', createdAt: { gte: questionWindowStart } },
      select: {
        id: true,
        conversationId: true,
        userId: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.activityEvent.findMany({
      where: { workspaceId },
      select: {
        id: true,
        userId: true,
        displayName: true,
        eventType: true,
        description: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: FEED_LIMIT,
    }),
    prisma.activityEvent.count({ where: { workspaceId } }),
    prisma.knowledgeItem.groupBy({
      by: ['source'],
      where: { workspaceId },
      _count: { _all: true },
    }),
    prisma.documentAttachment.groupBy({
      by: ['source'],
      where: { workspaceId },
      _count: { _all: true },
    }),
    prisma.documentAttachment.count({
      where: {
        workspaceId,
        extractionStatus: { in: ['failed', 'error', 'needs_ocr'] },
      },
    }),
    prisma.knowledgeItem.count({ where: { workspaceId, verified: false } }),
    prisma.activityEvent.count({ where: { workspaceId, eventType: 'conflict_detected' } }),
  ])

  const recentKnowledgeItems = await prisma.knowledgeItem.findMany({
    where: { workspaceId, updatedAt: { gte: activityWindowStart } },
    select: {
      id: true,
      content: true,
      source: true,
      category: true,
      verified: true,
      updatedAt: true,
      sourceUrl: true,
      sourceExternalId: true,
      sourceMetadata: true,
      sourceCreatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: MAX_TOP_ITEMS,
  })

  const knowledgeSourceMap = sourceKeyCounts(sourceCounts)
  const documentSourceMap = sourceKeyCounts(documentSourceCounts)
  const allSourceKeys = new Set([
    ...knowledgeSourceMap.keys(),
    ...documentSourceMap.keys(),
    ...integrations.map((integration) => integration.type),
    ...connectors.map((connector) => connector.sourceKey),
  ])

  const activeIntegrationKeys = new Set<string>()
  for (const integration of integrations) {
    if (isIntegrationConnected(integration)) activeIntegrationKeys.add(integration.type)
  }
  for (const connector of connectors) {
    if (connector.status !== 'not_configured') activeIntegrationKeys.add(connector.sourceKey)
  }
  const activeIntegrationCount = activeIntegrationKeys.size

  const activityByDay = countByDay(chartEvents, chartStart)
  const activityByDayMap = new Map(activityByDay.map((day) => [day.date, day.count]))
  for (const row of questionMessages) {
    const key = dayKey(startOfDayUTC(row.createdAt))
    if (activityByDayMap.has(key)) {
      activityByDayMap.set(key, (activityByDayMap.get(key) ?? 0) + 1)
    }
  }
  const mergedActivityByDay = activityByDay.map((day) => ({
    ...day,
    count: activityByDayMap.get(day.date) ?? day.count,
  }))

  const userCounts = new Map<string, { count: number; lastActiveAt: Date }>()
  for (const event of chartEvents) {
    if (!event.userId) continue
    const current = userCounts.get(event.userId) ?? { count: 0, lastActiveAt: event.createdAt }
    current.count += 1
    current.lastActiveAt = event.createdAt > current.lastActiveAt ? event.createdAt : current.lastActiveAt
    userCounts.set(event.userId, current)
  }
  for (const message of questionMessages) {
    if (!message.userId) continue
    const current = userCounts.get(message.userId) ?? { count: 0, lastActiveAt: message.createdAt }
    current.count += 1
    current.lastActiveAt = message.createdAt > current.lastActiveAt ? message.createdAt : current.lastActiveAt
    userCounts.set(message.userId, current)
  }

  const activeUsers = [...userCounts.entries()]
    .map(([userId, stat]) => ({
      userId,
      displayName: memberLookup[userId] ?? EMPTY_NAME,
      count: stat.count,
      lastActiveAt: stat.lastActiveAt.toISOString(),
    }))
    .sort((a, b) => b.count - a.count || b.lastActiveAt.localeCompare(a.lastActiveAt))
    .slice(0, MAX_TOP_ITEMS)

  const questionGroups = new Map<string, FrequentQuestionStat>()
  for (const row of questionMessages) {
    const summary = summarizeQueryRow(row)
    const current = questionGroups.get(summary.key)
    if (!current) {
      questionGroups.set(summary.key, {
        key: summary.key,
        label: summary.label,
        preview: summary.preview,
        count: 1,
        lastAskedAt: row.createdAt.toISOString(),
        conversationId: row.conversationId,
      })
      continue
    }

    current.count += 1
    if (row.createdAt.toISOString() > current.lastAskedAt) {
      current.lastAskedAt = row.createdAt.toISOString()
      current.preview = summary.preview
      current.conversationId = row.conversationId
      current.label = summary.label
    }
  }

  const frequentQuestions = [...questionGroups.values()]
    .sort((a, b) => b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt))
    .slice(0, MAX_TOP_ITEMS)

  const combinedSourceMap = new Map(knowledgeSourceMap)
  for (const [source, count] of documentSourceMap.entries()) {
    combinedSourceMap.set(source, (combinedSourceMap.get(source) ?? 0) + count)
  }

  const sources = [...combinedSourceMap.entries()]
    .map(([source, count]) => ({
      source,
      label: formatSourceLabel(source),
      count,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, MAX_TOP_ITEMS)

  const sourceInfoByKey = new Map<string, { itemCount: number; documentCount: number }>()
  for (const source of allSourceKeys) {
    sourceInfoByKey.set(source, {
      itemCount: knowledgeSourceMap.get(source) ?? 0,
      documentCount: documentSourceMap.get(source) ?? 0,
    })
  }

  const integrationHealth = [...allSourceKeys]
    .map((source) => {
      const integration = integrations.find((row) => row.type === source) ?? null
      const connector = connectors.find((row) => row.sourceKey === source) ?? null
      const status = detectIntegrationStatus(source, integration, connector)
      const counts = sourceInfoByKey.get(source) ?? { itemCount: 0, documentCount: 0 }
      const lastSyncAt = connector?.lastSyncAt ?? integration?.lastSyncAt ?? null
      return {
        source,
        label: formatSourceLabel(source),
        status,
        statusLabel: integrationHealthStatusLabel(status),
        lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
        itemCount: counts.itemCount,
        documentCount: counts.documentCount,
        href: `/dashboard/integrations/${encodeURIComponent(source)}`,
      }
    })
    .filter((item) => item.itemCount > 0 || item.documentCount > 0 || item.status !== 'needs_setup')
    .sort((a, b) => {
      const order: Record<IntegrationHealthStat['status'], number> = {
        connected: 0,
        sync_warning: 1,
        needs_setup: 2,
        disconnected: 3,
      }
      return order[a.status] - order[b.status] || b.itemCount - a.itemCount || a.label.localeCompare(b.label)
    })
    .slice(0, MAX_TOP_ITEMS)

  const recentKnowledge = recentKnowledgeItems
    .map((item) => ({
      id: item.id,
      title: shorten(item.content, 72),
      preview: shorten(item.content, 110),
      source: item.source,
      sourceLabel: formatSourceLabel(item.source),
      category: item.category,
      verified: item.verified,
      updatedAt: item.updatedAt.toISOString(),
      href: buildKnowledgeHref(item),
    }))
    .slice(0, MAX_TOP_ITEMS)

  const needsAttention: AttentionStat[] = []
  if (failedDocuments > 0) {
    needsAttention.push({
      label: failedDocuments === 1 ? '1 document needs attention' : `${failedDocuments} documents need attention`,
      description: 'Document extraction failed or needs another pass.',
      tone: 'warn',
      actionLabel: 'Review documents',
      actionHref: '/dashboard/integrations',
    })
  }
  const syncWarnings = connectors.filter((connector) => {
    const status = connector.status.toLowerCase()
    if (status === 'sync_error') return true
    const metadata = connector.metadata
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
    const summary = (metadata as Record<string, unknown>).lastSyncSummary
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return false
    const warnings = (summary as Record<string, unknown>).warnings
    return Array.isArray(warnings) && warnings.length > 0
  })
  if (syncWarnings.length > 0) {
    needsAttention.push({
      label: syncWarnings.length === 1 ? '1 integration has sync warnings' : `${syncWarnings.length} integrations have sync warnings`,
      description: 'One or more connectors reported sync warnings or errors.',
      tone: 'danger',
      actionLabel: 'Open integrations',
      actionHref: '/dashboard/integrations',
    })
  }
  if (unverifiedKnowledge > 0) {
    needsAttention.push({
      label: unverifiedKnowledge === 1 ? '1 unverified knowledge item' : `${unverifiedKnowledge} unverified knowledge items`,
      description: 'Review unverified knowledge before relying on it in answers.',
      tone: 'warn',
      actionLabel: 'Review knowledge',
      actionHref: '/dashboard/brain',
    })
  }
  if (conflictCount > 0) {
    needsAttention.push({
      label: conflictCount === 1 ? '1 conflict detected' : `${conflictCount} conflicts detected`,
      description: 'Conflicts need review before they spread through the brain.',
      tone: 'danger',
      actionLabel: 'View conflicts',
      actionHref: '/dashboard/alerts',
    })
  }
  const disconnectedIntegrations = integrations.filter((integration) => {
    if (!integration.accessToken?.trim()) return false
    return !isIntegrationConnected(integration)
  })
  if (disconnectedIntegrations.length > 0) {
    needsAttention.push({
      label: disconnectedIntegrations.length === 1 ? '1 integration disconnected' : `${disconnectedIntegrations.length} integrations disconnected`,
      description: 'Reconnect the affected source to resume syncing.',
      tone: 'warn',
      actionLabel: 'Reconnect',
      actionHref: '/dashboard/integrations',
    })
  }
  const datatruckConnector = connectors.find((connector) => connector.sourceKey === 'datatruck')
  if (datatruckConnector && extractWarningCount(datatruckConnector.metadata) > 0) {
    needsAttention.push({
      label: 'Datatruck sync has warnings',
      description: 'Datatruck reported warnings in its latest sync summary.',
      tone: 'warn',
      actionLabel: 'Open Datatruck',
      actionHref: '/dashboard/integrations/datatruck',
    })
  }

  const feedEvents = recentEvents.map(eventToFeedRow)

  return {
    totals: {
      knowledgeItems,
      questionsAsked: questionCount,
      documents,
      activeSources: activeIntegrationCount,
      activeUsers: activeUsers.length,
      syncs: syncCount,
    },
    activityByDay: mergedActivityByDay,
    sources,
    frequentQuestions,
    integrationHealth,
    recentKnowledge,
    activeUsers,
    needsAttention,
    feed: {
      events: feedEvents,
      total: feedTotalCount,
      page: 1,
      limit: FEED_LIMIT,
    },
  }
}

export function formatActivitySourceLabel(source: string): string {
  return formatSourceLabel(source)
}
