import {
  getKnowledgeDisplayCategory,
  getKnowledgeDisplaySource,
  getKnowledgeIsArchived,
  getKnowledgeDisplayTitle,
  normalizeKnowledgeItem,
} from '../display'

it('builds a title from existing KnowledgeItem fields in priority order', () => {
  expect(getKnowledgeDisplayTitle({ label: 'Label title', summary: 'Summary title.', notionPageTitle: 'Notion title', content: 'Content title' })).toBe('Label title')
  expect(getKnowledgeDisplayTitle({ summary: 'Summary title. More detail', notionPageTitle: 'Notion title', content: 'Content title' })).toBe('Summary title')
  expect(getKnowledgeDisplayTitle({ notionPageTitle: 'Notion title', content: 'Content title' })).toBe('Notion title')
  expect(getKnowledgeDisplayTitle({ content: 'A'.repeat(90) })).toBe(`${'A'.repeat(80)}…`)
  expect(getKnowledgeDisplayTitle({})).toBe('Untitled context')
})

it('derives lifecycle, tags, source, owner, and date from sourceMetadata', () => {
  const item = normalizeKnowledgeItem({
    content: 'Policy', verified: false, frozen: false, createdAt: new Date('2026-07-20T10:00:00Z'),
    sourceMetadata: { knowledgeStatus: 'archived', tags: ['policy'], sourceUrl: 'https://example.com', sender: 'Ali', messageDate: '2026-07-19T09:00:00Z' },
  })
  expect(item).toEqual(expect.objectContaining({ displayStatus: 'archived', displayTags: ['policy'], displaySourceUrl: 'https://example.com', displayOwner: 'Ali' }))
  expect(item.displaySourceCreatedAt).toEqual(new Date('2026-07-19T09:00:00Z'))
})

it('normalizes dashboard categories from category and safe metadata fallbacks', () => {
  expect(getKnowledgeDisplayCategory({ category: 'rule' })).toBe('rules')
  expect(getKnowledgeDisplayCategory({ category: '', sourceMetadata: { knowledgeType: 'decisions' } })).toBe('decisions')
  expect(getKnowledgeDisplayCategory({ category: null, sourceMetadata: { type: 'process' } })).toBe('processes')
  expect(getKnowledgeDisplayCategory({ category: 'reference' })).toBe('other')
  expect(getKnowledgeDisplayCategory({})).toBe('facts')
})

it('derives source and archive state without crashing on malformed metadata', () => {
  expect(getKnowledgeDisplaySource({ source: '', sourceMetadata: { integration: 'telegram' } })).toBe('telegram')
  expect(getKnowledgeDisplaySource({ sourceMetadata: null })).toBe('manual')
  expect(getKnowledgeIsArchived({ sourceMetadata: { knowledgeStatus: 'archived' } })).toBe(true)
  expect(getKnowledgeIsArchived({ sourceMetadata: { archived: true } })).toBe(true)
  expect(getKnowledgeIsArchived({ sourceMetadata: 'invalid' })).toBe(false)
})
