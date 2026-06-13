import { rankAndDedupeSources, splitRankedSources, type QuerySource } from '../source-ranking'

function source(overrides: Partial<QuerySource>): QuerySource {
  return {
    chunkId: 'source-1',
    pageId: null,
    pageTitle: 'Source',
    notionPageId: null,
    content: 'Context',
    labels: ['fact'],
    source: 'linear',
    sourceUrl: null,
    sourceExternalId: null,
    owner: null,
    sourceCreatedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    relevanceScore: 0.8,
    ...overrides,
  }
}

it('ranks by semantic relevance before category and recency', () => {
  const ranked = rankAndDedupeSources([
    source({ chunkId: 'decision', labels: ['decision'], relevanceScore: 0.7 }),
    source({ chunkId: 'fact', labels: ['fact'], relevanceScore: 0.9 }),
  ])
  expect(ranked.map((item) => item.chunkId)).toEqual(['fact', 'decision'])
})

it('uses category then recency to break relevance ties', () => {
  const ranked = rankAndDedupeSources([
    source({ chunkId: 'old-fact', labels: ['fact'], sourceExternalId: '1', sourceCreatedAt: '2026-05-01T00:00:00.000Z' }),
    source({ chunkId: 'decision', labels: ['decision'], sourceExternalId: '2', sourceCreatedAt: '2025-01-01T00:00:00.000Z' }),
    source({ chunkId: 'new-fact', labels: ['fact'], sourceExternalId: '3', sourceCreatedAt: '2026-06-01T00:00:00.000Z' }),
  ])
  expect(ranked.map((item) => item.chunkId)).toEqual(['decision', 'new-fact', 'old-fact'])
})

it('deduplicates multiple records from the same Linear issue', () => {
  const ranked = rankAndDedupeSources([
    source({ chunkId: 'canonical', content: 'Linear issue DT-96: torch.compile\nStatus: In Progress\nTeam: DeepTracer', sourceExternalId: 'issue-1', relevanceScore: 0.8 }),
    source({ chunkId: 'extracted', content: 'Team: DeepTracer', labels: ['decision'], sourceExternalId: 'issue-1', relevanceScore: 0.9 }),
  ])
  expect(ranked).toHaveLength(1)
  expect(ranked[0].chunkId).toBe('canonical')
  expect(ranked[0].relevanceScore).toBe(0.9)
  expect(ranked[0].labels).toEqual(expect.arrayContaining(['fact', 'decision']))
})

it('splits the top three distinct sources from remaining sources', () => {
  const sources = Array.from({ length: 5 }, (_, index) => source({
    chunkId: `source-${index}`,
    sourceExternalId: `issue-${index}`,
    relevanceScore: 1 - index / 10,
  }))
  const result = splitRankedSources(sources)
  expect(result.topSources).toHaveLength(3)
  expect(result.remainingSources).toHaveLength(2)
  expect(result.totalSources).toBe(5)
})
