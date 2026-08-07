import { rewriteQuery } from '../rewrite'

describe('conversation-aware query rewriting', () => {
  it('carries interview intent into an HRT follow-up', () => {
    const result = rewriteQuery({ currentQuery: 'What about HRT?', history: [{ role: 'user', content: 'How many interviews do I have?' }] })
    expect(result.rewrittenQuery).toMatch(/HRT/i)
    expect(result.rewrittenQuery).toMatch(/Hudson River Trading/i)
    expect(result.rewrittenQuery).toMatch(/interview/i)
    expect(result.rewrittenQuery).toMatch(/status|next/i)
  })

  it('focuses a trucking follow-up on DataTruck, not Five ELD', () => {
    const result = rewriteQuery({ currentQuery: 'What about DataTruck?', history: [{ role: 'user', content: 'Any updates from trucking integrations?' }] })
    expect(result.rewrittenQuery).toMatch(/DataTruck/i)
    expect(result.rewrittenQuery).not.toMatch(/Five ELD/i)
    expect(result.detectedEntities).toEqual(['DataTruck'])
  })

  it('carries interview intent into a Citadel follow-up', () => {
    const result = rewriteQuery({ currentQuery: 'and Citadel?', history: [{ role: 'user', content: 'What are my upcoming interviews?' }] })
    expect(result.rewrittenQuery).toMatch(/Citadel/i)
    expect(result.rewrittenQuery).toMatch(/interview/i)
  })

  it('uses a minimal entity lookup when no prior context exists', () => {
    const result = rewriteQuery({ currentQuery: 'What about HRT?' })
    expect(result.rewrittenQuery).toBe('Find information related to HRT / Hudson River Trading.')
    expect(result.rewrittenQuery).not.toMatch(/interview/i)
  })

  it('searches both HRT aliases', () => {
    const result = rewriteQuery({ currentQuery: 'HRT' })
    expect(result.entitySearchTerms).toEqual(expect.arrayContaining(['HRT', 'Hudson River Trading']))
  })
})
