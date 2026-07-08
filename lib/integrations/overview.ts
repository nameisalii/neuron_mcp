import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatDate, type KnowledgePreviewInput } from '@/lib/knowledge/preview'
import type { GmailSyncMetadata, KnowledgeCategory } from '@/types'
import { isIntegrationConnected } from './connection'
import { getConnectedIntegrationToken } from './connection-server'
import { isTelegramConfigured } from '@/lib/telegram/config'

export type IntegrationSource = 'slack' | 'notion' | 'linear' | 'gmail' | 'granola' | 'discord' | 'telegram' | 'teams' | 'jira' | 'whatsapp' | 'datatruck'

export type IntegrationFilter =
  | 'all'
  | 'decisions'
  | 'rules'
  | 'processes'
  | 'ideas'
  | 'facts'
  | 'status_updates'
  | 'plans'
  | 'follow_ups'

export const INTEGRATION_FILTERS: Array<{ key: IntegrationFilter; label: string; category: KnowledgeCategory | null }> = [
  { key: 'all', label: 'All', category: null },
  { key: 'decisions', label: 'Decisions', category: 'decision' },
  { key: 'rules', label: 'Rules', category: 'rule' },
  { key: 'processes', label: 'Processes', category: 'process' },
  { key: 'ideas', label: 'Ideas', category: 'idea' },
  { key: 'facts', label: 'Facts', category: 'fact' },
  { key: 'status_updates', label: 'Status Updates', category: 'status_update' },
  { key: 'plans', label: 'Plans', category: 'plan' },
  { key: 'follow_ups', label: 'Follow-ups', category: 'follow_up' },
]

const FILTER_LOOKUP = new Map(INTEGRATION_FILTERS.map((item) => [item.key, item]))
const CATEGORIES: KnowledgeCategory[] = ['decision', 'rule', 'process', 'idea', 'fact', 'status_update', 'plan', 'follow_up', 'reference', 'note']

export interface IntegrationSummaryCard {
  label: string
  value: string
}

export interface IntegrationDetail {
  label: string
  value: string
}

export interface IntegrationOverviewItem extends KnowledgePreviewInput {
  id: string
  sourceMetadata?: Prisma.JsonValue | null
}

export interface IntegrationOverviewEmptyState {
  title: string
  description: string
  actionLabel: string
  actionHref: string
}

export interface NotionProject {
  id: string
  title: string
  syncedAt: string
  chunkCount: number
  knowledgeCount: number
}

export interface IntegrationOverviewData {
  source: IntegrationSource
  title: string
  subtitle: string
  privacyNote?: string
  connected: boolean
  filter: IntegrationFilter
  lastSyncAt: string | null
  summaryCards: IntegrationSummaryCard[]
  details: IntegrationDetail[]
  totalCount: number
  categoryCounts: Record<KnowledgeCategory, number>
  filters: Array<{ key: IntegrationFilter; label: string; count: number }>
  items: IntegrationOverviewItem[]
  notionProjects?: NotionProject[]
  emptyState: IntegrationOverviewEmptyState
}

export function parseIntegrationFilter(value?: string | null): IntegrationFilter {
  if (!value) return 'all'
  return FILTER_LOOKUP.has(value as IntegrationFilter) ? (value as IntegrationFilter) : 'all'
}

function visibleKnowledgeWhere(source: IntegrationSource, workspaceId: string, userId: string): Prisma.KnowledgeItemWhereInput {
  if (source === 'gmail') {
    return { workspaceId, source: 'gmail', visibility: 'personal', visibilitySetBy: userId }
  }
  return {
    workspaceId,
    source,
    OR: [
      { visibility: 'team' },
      { visibility: 'personal', visibilitySetBy: userId },
    ],
  }
}

function sourceTitle(source: IntegrationSource): string {
  if (source === 'whatsapp') return 'WhatsApp Business Overview'
  if (source === 'datatruck') return 'Datatruck Overview'
  return `${source.charAt(0).toUpperCase()}${source.slice(1)} Overview`
}

function sourceSubtitle(source: IntegrationSource): string {
  switch (source) {
    case 'slack':
      return 'Knowledge extracted from your Slack workspace.'
    case 'notion':
      return 'Knowledge extracted from your Notion pages.'
    case 'linear':
      return 'Knowledge extracted from your Linear issues and updates.'
    case 'gmail':
      return 'Private memory extracted from your selected Gmail labels.'
    case 'granola':
      return 'Knowledge extracted from your Granola meeting notes.'
    case 'discord':
      return 'Knowledge extracted from your Discord server channels.'
    case 'telegram':
      return 'Knowledge extracted from new Telegram group and channel messages.'
    case 'teams':
      return 'Knowledge extracted from Microsoft Teams channel messages.'
    case 'jira':
      return 'Knowledge extracted from Jira issues, comments, bugs, and project updates.'
    case 'whatsapp':
      return 'Knowledge extracted from inbound WhatsApp Business messages.'
    case 'datatruck':
      return 'Knowledge extracted from Datatruck loads, documents, carriers, and dispatch context.'
    default:
      return `${source} overview`
  }
}

function emptyState(source: IntegrationSource, connected: boolean): IntegrationOverviewEmptyState {
  const label = source.charAt(0).toUpperCase() + source.slice(1)
  const displayLabel = source === 'whatsapp' ? 'WhatsApp Business' : label
  if (!connected) {
    return {
      title: `${displayLabel} is not connected yet.`,
      description: `Connect ${displayLabel} to start extracting knowledge from this source.`,
      actionLabel: 'Back to Integrations',
      actionHref: '/dashboard/integrations',
    }
  }

  if (source === 'gmail') {
    return {
      title: 'Gmail is connected, but no emails have been synced yet.',
      description: 'Open Gmail settings to sync now or adjust labels.',
      actionLabel: 'Sync Gmail now',
      actionHref: '/dashboard/integrations',
    }
  }

  return {
    title: `${displayLabel} is connected, but no knowledge has been synced yet.`,
    description: source === 'whatsapp'
      ? 'New inbound WhatsApp messages will appear here after Meta sends webhook events.'
      : source === 'telegram'
        ? 'Neuron only captures new Telegram messages after setup. Old Telegram history cannot be imported through the official bot API.'
      : source === 'teams'
        ? 'Run a recent sync after connecting Microsoft Teams. Tenant-wide or private chat access may require Microsoft admin consent.'
      : source === 'jira'
        ? 'Connect Jira and run a sync to import recent issues, comments, bugs, decisions, and project updates.'
      : `Run a sync from the integrations page to populate ${displayLabel.toLowerCase()} knowledge.`,
    actionLabel: source === 'whatsapp' ? 'Review webhook setup' : source === 'telegram' ? 'Check Telegram setup' : `Sync ${displayLabel} now`,
    actionHref: '/dashboard/integrations',
  }
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

async function getCategoryCounts(where: Prisma.KnowledgeItemWhereInput): Promise<Record<KnowledgeCategory, number>> {
  const entries = await Promise.all(CATEGORIES.map(async (category) => [category, await prisma.knowledgeItem.count({ where: { ...where, category } })] as const))
  return Object.fromEntries(entries) as Record<KnowledgeCategory, number>
}

export async function loadIntegrationOverview(
  workspaceId: string,
  userId: string,
  source: IntegrationSource,
  filter: IntegrationFilter,
): Promise<IntegrationOverviewData> {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: source } },
    select: {
      lastSyncAt: true,
      createdAt: true,
      channels: true,
      teamId: true,
      teamName: true,
      metadata: true,
      type: true,
      accessToken: true,
      workspace: {
        select: {
          type: true,
          owner: { select: { clerkId: true } },
        },
      },
    },
  })

  const datatruckConnector = source === 'datatruck'
    ? await prisma.apiConnector.findUnique({
      where: { workspaceId_sourceKey: { workspaceId, sourceKey: 'datatruck' } },
      select: { id: true, lastSyncAt: true, metadata: true },
    })
    : null

  const connected = source === 'notion'
    ? Boolean(getConnectedIntegrationToken(integration, {
      currentUserId: userId,
      workspaceType: integration?.workspace.type,
      workspaceOwnerClerkId: integration?.workspace.owner.clerkId,
    }))
    : source === 'telegram'
      ? isTelegramConfigured() && Boolean(integration?.channels.length)
      : source === 'datatruck'
        ? Boolean(datatruckConnector)
      : isIntegrationConnected(integration)
  const where = visibleKnowledgeWhere(source, workspaceId, userId)
  const activeCategory = FILTER_LOOKUP.get(filter)?.category

  if (source === 'notion' && !connected) {
    const categoryCounts = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<KnowledgeCategory, number>
    return buildOverviewData({
      source,
      connected,
      filter,
      lastSyncAt: null,
      summaryCards: [
        { label: 'Knowledge items', value: '0' },
        { label: 'Pages', value: '0' },
        { label: 'Chunks', value: '0' },
        { label: 'Last sync', value: 'Never' },
      ],
      details: [],
      totalCount: 0,
      categoryCounts,
      items: [],
      notionProjects: [],
    })
  }

  const [totalCount, categoryCounts, items] = await Promise.all([
    prisma.knowledgeItem.count({ where }),
    getCategoryCounts(where),
    prisma.knowledgeItem.findMany({
      where: {
        ...where,
        ...(activeCategory ? { category: activeCategory } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        content: true,
        category: true,
        aiSuggestedCategory: true,
        typeOverriddenByUser: true,
        source: true,
        sourceUrl: true,
        sourceExternalId: true,
        sourceMetadata: true,
        owner: true,
        sourceCreatedAt: true,
        updatedAt: true,
        notionPageTitle: true,
      },
    }),
  ])

  const lastSyncAt = source === 'datatruck'
    ? datatruckConnector?.lastSyncAt?.toISOString() ?? null
    : integration?.lastSyncAt?.toISOString() ?? null
  let summaryCards: IntegrationSummaryCard[] = [
    { label: 'Knowledge items', value: formatCount(totalCount) },
    { label: 'Decisions', value: formatCount(categoryCounts.decision) },
    { label: 'Rules', value: formatCount(categoryCounts.rule) },
    { label: 'Ideas', value: formatCount(categoryCounts.idea) },
    { label: 'Processes', value: formatCount(categoryCounts.process) },
    { label: 'Facts', value: formatCount(categoryCounts.fact) },
    { label: 'Last sync', value: lastSyncAt ? formatDate(lastSyncAt) : 'Never' },
  ]

  const details: IntegrationDetail[] = []

  if (source === 'datatruck') {
    const metadata = datatruckConnector?.metadata && typeof datatruckConnector.metadata === 'object' && !Array.isArray(datatruckConnector.metadata)
      ? datatruckConnector.metadata as Record<string, unknown>
      : {}
    const lastSyncSummary = metadata.lastSyncSummary && typeof metadata.lastSyncSummary === 'object' && !Array.isArray(metadata.lastSyncSummary)
      ? metadata.lastSyncSummary as Record<string, unknown>
      : {}
    const endpoints = lastSyncSummary.endpoints && typeof lastSyncSummary.endpoints === 'object' && !Array.isArray(lastSyncSummary.endpoints)
      ? lastSyncSummary.endpoints as Record<string, { fetched?: number }>
      : {}

    const [documentCount, recentDocuments] = await Promise.all([
      prisma.documentAttachment.count({ where: { workspaceId, source: 'datatruck' } }),
      prisma.documentAttachment.findMany({
        where: { workspaceId, source: 'datatruck' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { fileName: true, documentType: true, externalLoadId: true, extractionStatus: true, createdAt: true },
      }),
    ])

    summaryCards = [
      { label: 'Knowledge items', value: formatCount(totalCount) },
      { label: 'Loads', value: formatCount(endpoints.loads?.fetched ?? 0) },
      { label: 'Drivers', value: formatCount(endpoints.drivers?.fetched ?? 0) },
      { label: 'Trucks', value: formatCount(endpoints.trucks?.fetched ?? 0) },
      { label: 'Trailers', value: formatCount(endpoints.trailers?.fetched ?? 0) },
      { label: 'Documents', value: formatCount(documentCount) },
    ]

    details.push({ label: 'Company', value: typeof metadata.companyName === 'string' ? metadata.companyName : 'Datatruck' })
    for (const document of recentDocuments) {
      details.push({
        label: 'Document',
        value: [
          document.fileName,
          document.documentType,
          document.externalLoadId ? `Load ${document.externalLoadId}` : null,
          document.extractionStatus,
          document.createdAt.toLocaleDateString(),
        ].filter(Boolean).join(' · '),
      })
    }
    if (typeof lastSyncSummary.fetched === 'number') {
      details.push({ label: 'Last sync', value: `${formatCount(lastSyncSummary.fetched)} records imported` })
    }
    if (Array.isArray(lastSyncSummary.warnings) && lastSyncSummary.warnings.length > 0) {
      details.push({ label: 'Warnings', value: lastSyncSummary.warnings.join(' · ') })
    }
  }

  if (source === 'slack') {
    summaryCards = [
      { label: 'Knowledge items', value: formatCount(totalCount) },
      { label: 'Messages', value: formatCount(totalCount) },
      { label: 'Decisions', value: formatCount(categoryCounts.decision) },
      { label: 'Rules', value: formatCount(categoryCounts.rule) },
      { label: 'Ideas', value: formatCount(categoryCounts.idea) },
      { label: 'Last sync', value: lastSyncAt ? formatDate(lastSyncAt) : 'Never' },
    ]
    const channels = integration?.channels ?? []
    if (channels.length > 0) {
      details.push({ label: 'Channels', value: channels.map((channel) => `#${channel}`).join(' · ') })
    }
  }

  if (source === 'notion') {
    const visiblePagesWhere: Prisma.NotionPageWhereInput = {
      workspaceId,
      OR: [{ syncedBy: userId }, { chunks: { some: { visibility: 'team' } } }],
    }
    const [pageCount, chunkCount, notionProjects] = await Promise.all([
      prisma.notionPage.count({ where: visiblePagesWhere }),
      prisma.notionChunk.count({ where: { workspaceId } }),
      prisma.notionPage.findMany({
        where: visiblePagesWhere,
        orderBy: { syncedAt: 'desc' },
        select: {
          id: true,
          title: true,
          syncedAt: true,
          _count: { select: { chunks: true, knowledgeItems: true } },
        },
      }),
    ])

    summaryCards = [
      { label: 'Knowledge items', value: formatCount(totalCount) },
      { label: 'Pages', value: formatCount(pageCount) },
      { label: 'Chunks', value: formatCount(chunkCount) },
      { label: 'Decisions', value: formatCount(categoryCounts.decision) },
      { label: 'Ideas', value: formatCount(categoryCounts.idea) },
      { label: 'Last sync', value: lastSyncAt ? formatDate(lastSyncAt) : 'Never' },
    ]
    return buildOverviewData({
      source, connected, filter, lastSyncAt, summaryCards, details, totalCount, categoryCounts, items,
      notionProjects: notionProjects.map((page) => ({
        id: page.id,
        title: page.title,
        syncedAt: page.syncedAt.toISOString(),
        chunkCount: page._count.chunks,
        knowledgeCount: page._count.knowledgeItems,
      })),
    })
  }

  if (source === 'linear') {
    const team = integration?.teamName ?? integration?.teamId ?? 'Linear'
    summaryCards = [
      { label: 'Knowledge items', value: formatCount(totalCount) },
      { label: 'Issues', value: formatCount(totalCount) },
      { label: 'Decisions', value: formatCount(categoryCounts.decision) },
      { label: 'Rules', value: formatCount(categoryCounts.rule) },
      { label: 'Status updates', value: formatCount(categoryCounts.status_update) },
      { label: 'Last sync', value: lastSyncAt ? formatDate(lastSyncAt) : 'Never' },
    ]
    details.push({ label: 'Team', value: team })
  }

  if (source === 'teams') {
    summaryCards = [
      { label: 'Knowledge items', value: formatCount(totalCount) },
      { label: 'Messages', value: formatCount(totalCount) },
      { label: 'Decisions', value: formatCount(categoryCounts.decision) },
      { label: 'Rules', value: formatCount(categoryCounts.rule) },
      { label: 'Facts', value: formatCount(categoryCounts.fact) },
      { label: 'Last sync', value: lastSyncAt ? formatDate(lastSyncAt) : 'Never' },
    ]
    details.push({ label: 'Account', value: integration?.teamName ?? 'Microsoft Teams' })
    if (integration?.channels.length) {
      details.push({ label: 'Selected channels', value: formatCount(integration.channels.length) })
    }
  }

  if (source === 'jira') {
    summaryCards = [
      { label: 'Knowledge items', value: formatCount(totalCount) },
      { label: 'Issues', value: formatCount(totalCount) },
      { label: 'Decisions', value: formatCount(categoryCounts.decision) },
      { label: 'Rules', value: formatCount(categoryCounts.rule) },
      { label: 'Facts', value: formatCount(categoryCounts.fact) },
      { label: 'Last sync', value: lastSyncAt ? formatDate(lastSyncAt) : 'Never' },
    ]
    details.push({ label: 'Site', value: integration?.teamName ?? 'Jira Cloud' })
  }

  if (source === 'gmail') {
    const metadata = (integration?.metadata as GmailSyncMetadata | null) ?? null
    const threads = await prisma.emailThread.count({
      where: { workspaceId, syncedBy: userId },
    })
    const chunks = await prisma.emailChunk.count({
      where: { workspaceId, visibility: 'personal', visibilitySetBy: userId },
    })
    summaryCards = [
      { label: 'Knowledge items', value: formatCount(totalCount) },
      { label: 'Threads', value: formatCount(threads) },
      { label: 'Chunks', value: formatCount(chunks) },
      { label: 'Selected labels', value: (metadata?.selectedLabelNames?.length ? metadata.selectedLabelNames : metadata?.selectedLabels ?? []).join(', ') || 'All selected labels' },
      { label: 'Privacy', value: 'Personal' },
      { label: 'Last sync', value: lastSyncAt ? formatDate(lastSyncAt) : 'Never' },
    ]

    if (metadata?.selectedLabelNames?.length || metadata?.selectedLabels?.length) {
      details.push({
        label: 'Selected labels',
        value: (metadata.selectedLabelNames?.length ? metadata.selectedLabelNames : metadata.selectedLabels ?? []).join(' · '),
      })
    }
    if (metadata?.syncFrom) {
      details.push({ label: 'Sync from', value: formatDate(metadata.syncFrom) })
    }
  }

  return buildOverviewData({
    source, connected, filter, lastSyncAt, summaryCards, details, totalCount, categoryCounts, items,
  })
}

function buildOverviewData({
  source,
  connected,
  filter,
  lastSyncAt,
  summaryCards,
  details,
  totalCount,
  categoryCounts,
  items,
  notionProjects,
}: {
  source: IntegrationSource
  connected: boolean
  filter: IntegrationFilter
  lastSyncAt: string | null
  summaryCards: IntegrationSummaryCard[]
  details: IntegrationDetail[]
  totalCount: number
  categoryCounts: Record<KnowledgeCategory, number>
  items: Array<{
    id: string
    content: string
    category: string
    source: string
    sourceUrl: string | null
    sourceExternalId: string | null
    owner: string | null
    sourceCreatedAt: Date | null
    updatedAt: Date
    notionPageTitle: string | null
    aiSuggestedCategory: string | null
    typeOverriddenByUser: boolean
  }>
  notionProjects?: NotionProject[]
}): IntegrationOverviewData {
  return {
    source,
    title: sourceTitle(source),
    subtitle: sourceSubtitle(source),
    privacyNote: source === 'gmail' ? 'Gmail memory is personal. Your emails are not shared with your team.' : undefined,
    connected,
    filter,
    lastSyncAt,
    summaryCards,
    details,
    totalCount,
    categoryCounts,
    filters: INTEGRATION_FILTERS.map((item) => ({
      key: item.key,
      label: item.label,
      count: item.key === 'all' || !item.category ? totalCount : categoryCounts[item.category] ?? 0,
    })),
    items: items.map((item) => ({
      ...item,
      sourceLabels: [item.category],
      sourceCreatedAt: item.sourceCreatedAt?.toISOString() ?? null,
      updatedAt: item.updatedAt.toISOString(),
      title: item.notionPageTitle ?? null,
    })),
    notionProjects,
    emptyState: emptyState(source, connected),
  }
}
