export const KNOWLEDGE_CATEGORY_OPTIONS = [
  { value: 'decision', apiValue: 'DECISION', label: 'Decision' },
  { value: 'rule', apiValue: 'RULE', label: 'Rule' },
  { value: 'process', apiValue: 'PROCESS', label: 'Process' },
  { value: 'fact', apiValue: 'FACT', label: 'Fact' },
  { value: 'idea', apiValue: 'IDEA', label: 'Idea' },
  { value: 'reference', apiValue: 'REFERENCE', label: 'Reference' },
  { value: 'status_update', apiValue: 'STATUS_UPDATE', label: 'Status Update' },
  { value: 'note', apiValue: 'NOTE', label: 'Note' },
] as const

export type EditableKnowledgeCategory = typeof KNOWLEDGE_CATEGORY_OPTIONS[number]['value']

const API_TO_CATEGORY = new Map<string, EditableKnowledgeCategory>(KNOWLEDGE_CATEGORY_OPTIONS.map((item) => [item.apiValue, item.value]))
const CATEGORY_VALUES = new Set<string>(KNOWLEDGE_CATEGORY_OPTIONS.map((item) => item.value))

export function normalizeKnowledgeCategory(input: unknown): EditableKnowledgeCategory | null {
  if (typeof input !== 'string') return null
  const normalized = input.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return (API_TO_CATEGORY.get(normalized) ?? (CATEGORY_VALUES.has(input) ? input : null)) as EditableKnowledgeCategory | null
}

export function labelForKnowledgeCategory(category: string): string {
  return KNOWLEDGE_CATEGORY_OPTIONS.find((item) => item.value === category)?.label ?? category
}
