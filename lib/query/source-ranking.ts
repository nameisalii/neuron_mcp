export interface QuerySource {
  chunkId: string
  pageId: string | null
  pageTitle: string
  notionPageId: string | null
  content: string
  labels: string[]
  source: string
  sourceUrl: string | null
  sourceExternalId: string | null
  owner: string | null
  sourceMetadata?: Record<string, unknown> | null
  sourceCreatedAt: string | null
  updatedAt: string | null
  visibility?: string | null
  relevanceScore: number
  verified?: boolean
  conflictNote?: string | null
}

export interface SourceRankingIntent {
  requestedSources?: string[]
  temporalType?: string
  query?: string
  entityTerms?: string[]
}

const CATEGORY_PRIORITY: Record<string, number> = {
  decision: 7,
  rule: 6,
  process: 5,
  follow_up: 5,
  status_update: 4,
  plan: 4,
  idea: 3,
  reference: 2,
  fact: 1,
}

function categoryPriority(source: QuerySource): number {
  return Math.max(0, ...source.labels.map((label) => CATEGORY_PRIORITY[label.toLowerCase()] ?? 0))
}

function sourceQuality(source: QuerySource): number {
  return Number(Boolean(source.sourceUrl)) + Number(Boolean(source.pageTitle)) + Number(Boolean(source.owner || source.sourceExternalId))
}

function timestamp(source: QuerySource): number {
  return new Date(source.sourceCreatedAt ?? source.updatedAt ?? 0).getTime() || 0
}

export function meaningfulSourceContent(content: string): boolean {
  const cleaned = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length < 12) return false
  if (/^(fact|update|message|note|n\/a|none)$/i.test(cleaned)) return false
  if (!/[a-z0-9]/i.test(cleaned)) return false
  return true
}

function exactMatchBoost(source: QuerySource, query: string | undefined): number {
  if (!query) return 0
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 3)
  if (terms.length === 0) return 0
  const haystack = `${source.pageTitle} ${source.content} ${source.owner ?? ''} ${source.sourceExternalId ?? ''}`.toLowerCase()
  const matches = terms.filter((term) => haystack.includes(term)).length
  return Math.min(matches / Math.max(terms.length, 1), 1)
}

function entityMatchBoost(source: QuerySource, entityTerms: string[] | undefined): number {
  if (!entityTerms?.length) return 0
  const haystack = `${source.pageTitle} ${source.content} ${source.owner ?? ''} ${source.sourceExternalId ?? ''}`.toLowerCase()
  return entityTerms.some((term) => haystack.includes(term.toLowerCase())) ? 1 : 0
}

function recencyBoost(source: QuerySource): number {
  const time = timestamp(source)
  if (!time) return 0
  const ageDays = Math.max(0, (Date.now() - time) / 86_400_000)
  if (ageDays <= 1) return 1
  if (ageDays <= 7) return 0.8
  if (ageDays <= 30) return 0.45
  if (ageDays <= 90) return 0.2
  return 0
}

function hybridScore(source: QuerySource, intent?: SourceRankingIntent): number {
  const requested = intent?.requestedSources ?? []
  const sourceMatch = requested.length === 0 ? 0 : requested.includes(source.source) ? 1 : -0.5
  const recency = intent?.temporalType && intent.temporalType !== 'all_time' ? recencyBoost(source) : 0
  const exact = exactMatchBoost(source, intent?.query)
  const entity = entityMatchBoost(source, intent?.entityTerms)
  return (
    source.relevanceScore * 0.45 +
    sourceMatch * 0.2 +
    recency * 0.15 +
    exact * 0.1 +
    entity * 0.1
  )
}

function dedupeKey(source: QuerySource): string {
  if (source.source === 'linear') {
    return `linear:${source.sourceExternalId ?? source.sourceUrl ?? source.chunkId}`
  }
  if (source.source === 'notion') {
    return `notion:${source.notionPageId ?? source.pageId ?? source.pageTitle}`
  }
  if (source.source === 'slack' && source.sourceUrl) {
    return `slack:${source.sourceUrl}`
  }
  return `${source.source}:${source.sourceExternalId ?? source.sourceUrl ?? source.chunkId}`
}

export function rankAndDedupeSources(sources: QuerySource[], intent?: SourceRankingIntent): QuerySource[] {
  const grouped = new Map<string, QuerySource>()
  for (const source of sources.filter((item) => meaningfulSourceContent(item.content))) {
    const key = dedupeKey(source)
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, source)
      continue
    }

    const representative = representativeQuality(source) > representativeQuality(existing) ? source : existing
    grouped.set(key, {
      ...representative,
      relevanceScore: Math.max(existing.relevanceScore, source.relevanceScore),
      labels: [...new Set([...existing.labels, ...source.labels])],
    })
  }

  return [...grouped.values()].sort((a, b) => {
    return (
      hybridScore(b, intent) - hybridScore(a, intent) ||
      b.relevanceScore - a.relevanceScore ||
      categoryPriority(b) - categoryPriority(a) ||
      timestamp(b) - timestamp(a) ||
      sourceQuality(b) - sourceQuality(a) ||
      a.chunkId.localeCompare(b.chunkId)
    )
  })
}

export function splitRankedSources(sources: QuerySource[], limit = 3, intent?: SourceRankingIntent) {
  const ranked = rankAndDedupeSources(sources, intent)
  return {
    sources: ranked,
    topSources: ranked.slice(0, limit),
    remainingSources: ranked.slice(limit),
    totalSources: ranked.length,
  }
}

function representativeQuality(source: QuerySource): number {
  return (
    Number(/^Linear issue\s+[^:]+:/i.test(source.content)) * 4 +
    Number(/\nDescription:|\nStatus:|\nTeam:/i.test(source.content)) * 4 +
    Number(Boolean(source.sourceUrl)) * 2 +
    Number(Boolean(source.pageTitle)) +
    Number(Boolean(source.owner)) +
    Math.min(source.content.length / 10000, 0.9)
  )
}
