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
  sourceCreatedAt: string | null
  updatedAt: string | null
  relevanceScore: number
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

export function rankAndDedupeSources(sources: QuerySource[]): QuerySource[] {
  const grouped = new Map<string, QuerySource>()
  for (const source of sources) {
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
      b.relevanceScore - a.relevanceScore ||
      categoryPriority(b) - categoryPriority(a) ||
      timestamp(b) - timestamp(a) ||
      sourceQuality(b) - sourceQuality(a) ||
      a.chunkId.localeCompare(b.chunkId)
    )
  })
}

export function splitRankedSources(sources: QuerySource[], limit = 3) {
  const ranked = rankAndDedupeSources(sources)
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
