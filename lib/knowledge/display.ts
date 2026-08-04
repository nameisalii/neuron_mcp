type KnowledgeDisplayInput = {
  content?: string | null
  summary?: string | null
  reason?: string | null
  label?: string | null
  category?: string | null
  source?: string | null
  notionPageTitle?: string | null
  verified?: boolean | null
  frozen?: boolean | null
  conflictNote?: string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  sourceMetadata?: unknown
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value as Record<string, unknown> } : {}
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function excerpt(value: string | null | undefined, length: number) {
  if (!value) return ''
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > length ? `${clean.slice(0, length).trimEnd()}…` : clean
}

export function getKnowledgeDisplayTitle(item: KnowledgeDisplayInput) {
  return text(item.label)
    ?? text(excerpt(item.summary?.split(/[.!?](?:\s|$)/)[0], 80))
    ?? text(item.notionPageTitle)
    ?? text(excerpt(item.content, 80))
    ?? 'Untitled context'
}

export function getKnowledgeDisplaySummary(item: KnowledgeDisplayInput) {
  return text(item.summary) ?? text(excerpt(item.content, 220)) ?? text(item.reason) ?? ''
}

export type KnowledgeDisplayCategory = 'rules' | 'decisions' | 'ideas' | 'facts' | 'processes' | 'other'

export function getKnowledgeDisplayCategory(item: KnowledgeDisplayInput): KnowledgeDisplayCategory {
  const metadata = metadataRecord(item.sourceMetadata)
  const raw = (text(item.category) ?? text(metadata.knowledgeType) ?? text(metadata.type) ?? 'fact').toLowerCase()
  if (raw === 'rule' || raw === 'rules') return 'rules'
  if (raw === 'decision' || raw === 'decisions') return 'decisions'
  if (raw === 'idea' || raw === 'ideas') return 'ideas'
  if (raw === 'fact' || raw === 'facts') return 'facts'
  if (raw === 'process' || raw === 'processes') return 'processes'
  return 'other'
}

export function getKnowledgeDisplayIntegration(item: KnowledgeDisplayInput) {
  const metadata = metadataRecord(item.sourceMetadata)
  return text(item.source) ?? text(metadata.sourceType) ?? text(metadata.integration) ?? 'manual'
}

export const getKnowledgeDisplaySource = getKnowledgeDisplayIntegration

export function getKnowledgeDisplayDate(item: KnowledgeDisplayInput) {
  return item.updatedAt ?? item.createdAt ?? null
}

export function getKnowledgeIsArchived(item: KnowledgeDisplayInput) {
  const metadata = metadataRecord(item.sourceMetadata)
  return text(metadata.knowledgeStatus)?.toLowerCase() === 'archived' || metadata.archived === true
}

export function getKnowledgeStatus(item: KnowledgeDisplayInput) {
  const metadata = metadataRecord(item.sourceMetadata)
  const stored = text(metadata.knowledgeStatus)
  if (stored && ['needs_review', 'outdated', 'conflicting', 'archived'].includes(stored)) return stored
  if (item.conflictNote) return 'conflicting'
  if (item.verified || item.frozen) return 'verified'
  return 'unverified'
}

export function getKnowledgeSourceUrl(item: KnowledgeDisplayInput) {
  const metadata = metadataRecord(item.sourceMetadata)
  return text(metadata.url) ?? text(metadata.sourceUrl) ?? text(metadata.link)
}

export function getKnowledgeSourceCreatedAt(item: KnowledgeDisplayInput) {
  const metadata = metadataRecord(item.sourceMetadata)
  const raw = text(metadata.createdAt) ?? text(metadata.sourceCreatedAt) ?? text(metadata.messageDate)
  const parsed = raw ? new Date(raw) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : item.createdAt ?? null
}

export function getKnowledgeOwner(item: KnowledgeDisplayInput) {
  const metadata = metadataRecord(item.sourceMetadata)
  return text(metadata.owner) ?? text(metadata.author) ?? text(metadata.sender) ?? text(metadata.userName)
}

export function getKnowledgeTags(item: KnowledgeDisplayInput) {
  const tags = metadataRecord(item.sourceMetadata).tags
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())).map(tag => tag.trim()) : []
}

export function normalizeKnowledgeItem<T extends KnowledgeDisplayInput>(item: T) {
  return {
    ...item,
    displayTitle: getKnowledgeDisplayTitle(item),
    displaySummary: getKnowledgeDisplaySummary(item),
    displayCategory: getKnowledgeDisplayCategory(item),
    displayIntegration: getKnowledgeDisplayIntegration(item),
    displaySource: getKnowledgeDisplayIntegration(item),
    displayDate: getKnowledgeDisplayDate(item),
    displayArchived: getKnowledgeIsArchived(item),
    displayStatus: getKnowledgeStatus(item),
    displayTags: getKnowledgeTags(item),
    displaySourceUrl: getKnowledgeSourceUrl(item),
    displayOwner: getKnowledgeOwner(item),
    displaySourceCreatedAt: getKnowledgeSourceCreatedAt(item),
  }
}

export function mergeKnowledgeMetadata(current: unknown, changes: Record<string, unknown>) {
  return { ...metadataRecord(current), ...changes }
}
