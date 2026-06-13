const USEFUL_CATEGORIES = new Set(['decision', 'rule', 'process', 'idea'])

export interface NotionPageRankingInput {
  id: string
  title: string
  lastEditedAt: Date
  syncedAt: Date
  knowledgeCount: number
  labels: string[]
}

export function rankNotionPages<T extends NotionPageRankingInput>(pages: T[]): T[] {
  return [...pages].sort((a, b) =>
    b.knowledgeCount - a.knowledgeCount
    || b.lastEditedAt.getTime() - a.lastEditedAt.getTime()
    || b.syncedAt.getTime() - a.syncedAt.getTime()
    || usefulCategoryCount(b.labels) - usefulCategoryCount(a.labels)
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id)
  )
}

export function usefulCategoryCount(labels: string[]): number {
  return labels.filter((label) => USEFUL_CATEGORIES.has(label)).length
}

export function notionPageSummary(title: string, labels: string[], knowledgeCount: number): string {
  const useful = labels.filter((label) => USEFUL_CATEGORIES.has(label))
  if (useful.length > 0) {
    return `Contains ${useful.slice(0, 3).join(', ')} and supporting company context.`
  }
  if (knowledgeCount > 0) return `Contains ${knowledgeCount} extracted knowledge item${knowledgeCount === 1 ? '' : 's'} and supporting context.`
  return `Contains useful context from ${title}.`
}
