import { rankNotionPages } from '../ranking'

const date = (value: string) => new Date(value)

it('ranks by knowledge count, then recency, then useful categories, then stable title', () => {
  const pages = [
    { id: '4', title: 'Zeta', knowledgeCount: 1, lastEditedAt: date('2026-01-01'), syncedAt: date('2026-01-01'), labels: ['fact'] },
    { id: '2', title: 'Recent Fact', knowledgeCount: 2, lastEditedAt: date('2026-02-01'), syncedAt: date('2026-01-01'), labels: ['fact'] },
    { id: '1', title: 'Older Decision', knowledgeCount: 2, lastEditedAt: date('2026-01-01'), syncedAt: date('2026-01-01'), labels: ['decision'] },
    { id: '3', title: 'Alpha', knowledgeCount: 1, lastEditedAt: date('2026-01-01'), syncedAt: date('2026-01-01'), labels: ['fact'] },
  ]

  expect(rankNotionPages(pages).map((page) => page.title)).toEqual([
    'Recent Fact', 'Older Decision', 'Alpha', 'Zeta',
  ])
})
