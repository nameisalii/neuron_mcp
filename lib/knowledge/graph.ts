export const MAX_GRAPH_NODES = 60
export const MAX_GRAPH_EDGES = 180
export const MAX_TOP_ITEMS = 5

export type KnowledgeGraphItem = {
  id: string
  title: string
  summary: string
  category: string
  source: string
  createdAt: string
}

export type KnowledgeGraphNode = {
  id: string
  label: string
  kind: 'source' | 'entity' | 'category'
  source: string | null
  sourceType: string
  size: number
  knowledgeCount: number
  taskCount: number
  decisionCount: number
  confidenceAvg: number
  color: string
  summary: string
  relatedItemIds: string[]
  topItems: KnowledgeGraphItem[]
  metadata: { verifiedCount: number; keywords: string[] }
}

export type KnowledgeGraphEdge = {
  id: string
  from: string
  to: string
  weight: number
  reason: string
  relatedCount: number
}

export type KnowledgeGraphData = {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  stats: { totalKnowledge: number; totalSources: number; totalEdges: number; largestNodeSize: number }
}

export type GraphKnowledgeRow = {
  id: string
  content: string
  summary: string | null
  reason: string | null
  label: string | null
  category: string
  source: string
  sourceExternalId: string | null
  sourceMetadata: unknown
  createdAt: Date
  updatedAt: Date
  verified: boolean
  confidence: number
  extractedTasks?: Array<{ id: string }>
}

export type GraphTaskRow = { id: string; extractedFromKnowledgeItemId: string | null; sourceType: string | null; title: string }
export type GraphDecisionRow = { id: string; source: string; title: string; decision: string }

const SOURCE_COLORS: Record<string, string> = {
  gmail: '#ef4444', slack: '#8b5cf6', telegram: '#3b82f6', notion: '#d1d5db',
  linear: '#6366f1', discord: '#5865f2', datatruck: '#22c55e', 'five eld': '#f59e0b',
  five_eld: '#f59e0b', manual: '#9ca3af', unknown: '#64748b',
}

const COMPANY_PATTERNS = [
  'The Trade Desk', 'HRT', 'Citadel', 'DataTruck', 'Neuron', 'Five ELD',
]
const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'because', 'before', 'being', 'could', 'from', 'have', 'into', 'more', 'only', 'other', 'should', 'their', 'there', 'these', 'they', 'this', 'through', 'under', 'what', 'when', 'where', 'which', 'with', 'would', 'your'])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function short(value: unknown, limit = 180): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, limit)
}

function titleFor(item: GraphKnowledgeRow): string {
  const metadata = record(item.sourceMetadata)
  return short(item.label, 100)
    || short(item.summary?.split(/(?<=[.!?])\s/)[0], 100)
    || short(metadata.subject, 100)
    || short(metadata.title, 100)
    || short(metadata.notionPageTitle, 100)
    || short(item.content, 100)
    || 'Untitled context'
}

function displayLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function normalizeCategory(value: string): string {
  const key = value.toLowerCase()
  if (key.includes('rule')) return 'Rules'
  if (key.includes('decision')) return 'Decisions'
  if (key.includes('idea')) return 'Ideas'
  if (key.includes('process') || key.includes('procedure')) return 'Processes'
  return 'Facts'
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringValues)
  return []
}

function entitiesFor(item: GraphKnowledgeRow): string[] {
  const metadata = record(item.sourceMetadata)
  const explicit = ['entity', 'entities', 'company', 'companies', 'organization', 'project', 'client']
    .flatMap(key => stringValues(metadata[key]))
    .map(value => short(value, 60))
    .filter(value => value.length >= 2)
  const haystack = `${item.label ?? ''} ${item.summary ?? ''} ${short(item.content, 500)}`
  const known = COMPANY_PATTERNS.filter(name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack))
  return [...new Set([...explicit, ...known])].slice(0, 4)
}

function keywordsFor(item: GraphKnowledgeRow): string[] {
  const text = `${item.label ?? ''} ${item.summary ?? ''} ${short(item.content, 350)}`.toLowerCase()
  const counts = new Map<string, number>()
  for (const word of text.match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
    if (!STOP_WORDS.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([word]) => word)
}

type MutableGroup = {
  id: string
  label: string
  kind: 'source' | 'entity' | 'category'
  source: string | null
  items: GraphKnowledgeRow[]
  keywords: Set<string>
}

function groupId(kind: MutableGroup['kind'], label: string): string {
  return `${kind}:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

export function buildKnowledgeGraph(
  items: GraphKnowledgeRow[],
  tasks: GraphTaskRow[] = [],
  decisions: GraphDecisionRow[] = [],
): KnowledgeGraphData {
  const groups = new Map<string, MutableGroup>()
  const itemGroups = new Map<string, Set<string>>()
  const externalGroups = new Map<string, Set<string>>()

  function add(item: GraphKnowledgeRow, kind: MutableGroup['kind'], label: string, source: string | null) {
    const id = groupId(kind, label)
    const group = groups.get(id) ?? { id, label, kind, source, items: [], keywords: new Set<string>() }
    if (!group.items.some(existing => existing.id === item.id)) group.items.push(item)
    keywordsFor(item).forEach(keyword => group.keywords.add(keyword))
    groups.set(id, group)
    const memberships = itemGroups.get(item.id) ?? new Set<string>()
    memberships.add(id)
    itemGroups.set(item.id, memberships)
    if (item.sourceExternalId) {
      const external = externalGroups.get(`${item.source}:${item.sourceExternalId}`) ?? new Set<string>()
      external.add(id)
      externalGroups.set(`${item.source}:${item.sourceExternalId}`, external)
    }
  }

  for (const item of items) {
    const source = item.source?.trim()
    if (source) add(item, 'source', displayLabel(source), source.toLowerCase())
    const entities = entitiesFor(item)
    entities.forEach(entity => add(item, 'entity', entity, source?.toLowerCase() ?? null))
    if (!source && entities.length === 0) add(item, 'category', normalizeCategory(item.category), null)
  }

  const keptGroups = [...groups.values()]
    .sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label))
    .slice(0, MAX_GRAPH_NODES)
  const keptIds = new Set(keptGroups.map(group => group.id))
  const largestCount = Math.max(1, ...keptGroups.map(group => group.items.length))
  const taskByItem = new Map<string, number>()
  for (const task of tasks) if (task.extractedFromKnowledgeItemId) taskByItem.set(task.extractedFromKnowledgeItemId, (taskByItem.get(task.extractedFromKnowledgeItemId) ?? 0) + 1)

  const nodes: KnowledgeGraphNode[] = keptGroups.map(group => {
    const ids = new Set(group.items.map(item => item.id))
    const taskCount = group.items.reduce((sum, item) => sum + (taskByItem.get(item.id) ?? item.extractedTasks?.length ?? 0), 0)
    const groupWords = group.keywords
    const decisionCount = decisions.filter(decision => (
      (group.source && decision.source.toLowerCase() === group.source)
      || [...groupWords].some(word => word.length > 4 && `${decision.title} ${decision.decision}`.toLowerCase().includes(word))
    )).length
    const normalizedLogCount = largestCount === 1 ? 0 : Math.log1p(group.items.length - 1) / Math.log(largestCount)
    const confidenceAvg = group.items.reduce((sum, item) => sum + Math.max(0, Math.min(1, item.confidence)), 0) / group.items.length
    const sourceType = group.source ?? (group.kind === 'category' ? 'manual' : 'unknown')
    return {
      id: group.id,
      label: group.label,
      kind: group.kind,
      source: group.source,
      sourceType,
      size: Number((0.65 + normalizedLogCount * 1.2).toFixed(3)),
      knowledgeCount: group.items.length,
      taskCount,
      decisionCount,
      confidenceAvg: Number(confidenceAvg.toFixed(3)),
      color: SOURCE_COLORS[sourceType] ?? SOURCE_COLORS.unknown,
      summary: `${group.items.length} knowledge ${group.items.length === 1 ? 'item' : 'items'} from ${group.label}.`,
      relatedItemIds: [...ids].slice(0, 100),
      topItems: group.items
        .slice().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, MAX_TOP_ITEMS)
        .map(item => ({
          id: item.id,
          title: titleFor(item),
          summary: short(item.summary || item.reason || item.content),
          category: normalizeCategory(item.category),
          source: item.source,
          createdAt: item.createdAt.toISOString(),
        })),
      metadata: { verifiedCount: group.items.filter(item => item.verified).length, keywords: [...groupWords].slice(0, 8) },
    }
  })

  const relationships = new Map<string, { count: number; reasons: Set<string> }>()
  function connect(ids: Iterable<string>, reason: string) {
    const values = [...new Set(ids)].filter(id => keptIds.has(id)).sort()
    for (let a = 0; a < values.length; a++) for (let b = a + 1; b < values.length; b++) {
      const key = `${values[a]}|${values[b]}`
      const relation = relationships.get(key) ?? { count: 0, reasons: new Set<string>() }
      relation.count += 1
      relation.reasons.add(reason)
      relationships.set(key, relation)
    }
  }
  itemGroups.forEach(ids => connect(ids, 'shared knowledge items'))
  externalGroups.forEach(ids => connect(ids, 'same thread, page, or channel'))
  for (let a = 0; a < keptGroups.length; a++) for (let b = a + 1; b < keptGroups.length; b++) {
    const shared = [...keptGroups[a].keywords].filter(word => keptGroups[b].keywords.has(word))
    if (shared.length >= 2) connect([keptGroups[a].id, keptGroups[b].id], `shared topics: ${shared.slice(0, 2).join(', ')}`)
  }

  const edges = [...relationships.entries()]
    .map(([key, relation]) => {
      const [from, to] = key.split('|')
      return { id: key, from, to, weight: Number(Math.min(6, 0.75 + Math.log1p(relation.count) * 1.5).toFixed(2)), reason: [...relation.reasons].join('; '), relatedCount: relation.count }
    })
    .sort((a, b) => b.relatedCount - a.relatedCount || a.id.localeCompare(b.id))
    .slice(0, MAX_GRAPH_EDGES)

  return {
    nodes,
    edges,
    stats: {
      totalKnowledge: items.length,
      totalSources: new Set(items.map(item => item.source).filter(Boolean)).size,
      totalEdges: edges.length,
      largestNodeSize: Math.max(0, ...nodes.map(node => node.size)),
    },
  }
}
