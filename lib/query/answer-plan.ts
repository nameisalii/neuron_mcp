import type { QuerySource } from './source-ranking'
import type { QueryRewriteResult } from './rewrite'

export interface QueryAnswerPlan {
  answerType: 'count' | 'status' | 'summary' | 'not_found' | 'clarification'
  entities: string[]
  evidence: Array<{ sourceId: string; sourceType: string; date: string | null }>
  conflicts: string[]
  uncertainty: string | null
  suggestedNextAction: string | null
}

export function planQueryAnswer(rewrite: QueryRewriteResult, sources: QuerySource[]): QueryAnswerPlan {
  const interviewQuery = /interview|recruiter|online assessment|\boa\b/i.test(rewrite.rewrittenQuery)
  return {
    answerType: rewrite.needsClarification
      ? 'clarification'
      : sources.length === 0 ? 'not_found'
        : rewrite.detectedIntent === 'count_interviews' || /interview count/i.test(rewrite.rewrittenQuery) ? 'count'
          : interviewQuery ? 'status' : 'summary',
    entities: rewrite.detectedEntities,
    evidence: sources.map((source) => ({
      sourceId: source.chunkId,
      sourceType: source.source,
      date: source.sourceCreatedAt ?? source.updatedAt,
    })),
    conflicts: sources.filter((source) => source.conflictNote).map((source) => source.conflictNote!),
    uncertainty: sources.length === 0
      ? 'No relevant synced sources were found.'
      : interviewQuery ? 'The exact count, dates, or status must not be stated unless the sources explicitly support it.' : null,
    suggestedNextAction: interviewQuery ? 'Offer to create a follow-up task or reminder.' : null,
  }
}
