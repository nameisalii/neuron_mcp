import { planQueryAnswer } from '../answer-plan'
import { rewriteQuery } from '../rewrite'
import type { QuerySource } from '../source-ranking'

function source(sourceType: string): QuerySource {
  return {
    chunkId: `${sourceType}-1`, pageId: null, pageTitle: 'HRT recruiting', notionPageId: null,
    content: 'HRT recruiting update with no confirmed date.', labels: ['status_update'], source: sourceType,
    sourceUrl: null, sourceExternalId: null, owner: null, sourceCreatedAt: null, updatedAt: null,
    relevanceScore: 0.9,
  }
}

it('plans uncertainty without inventing interview dates', () => {
  const rewrite = rewriteQuery({ currentQuery: 'What about HRT?', history: [{ role: 'user', content: 'How many interviews do I have?' }] })
  const plan = planQueryAnswer(rewrite, [source('gmail')])
  expect(plan.uncertainty).toMatch(/must not be stated unless/i)
  expect(plan.evidence[0].date).toBeNull()
})

it('keeps Gmail and Task evidence as distinct source types', () => {
  const rewrite = rewriteQuery({ currentQuery: 'HRT interview status' })
  const plan = planQueryAnswer(rewrite, [source('gmail'), source('task')])
  expect(plan.evidence.map((item) => item.sourceType)).toEqual(['gmail', 'task'])
})
