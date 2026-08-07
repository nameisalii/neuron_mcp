import { tsImport } from 'tsx/esm/api'

const { rewriteQuery } = await tsImport('../lib/query/rewrite.ts', import.meta.url)

const examples = [
  'How many interviews do I have?',
  'What about HRT?',
  'and Citadel?',
  'what about DataTruck?',
  'when is it?',
]

const history = []
for (const originalQuery of examples) {
  const result = rewriteQuery({ currentQuery: originalQuery, history })
  const sourceCounts = Object.fromEntries(result.sourceHints.map((source) => [source, 0]))
  const preview = result.needsClarification
    ? result.clarificationQuestion
    : `Simulation only for: ${result.rewrittenQuery} Connect to a local authenticated Query session to retrieve source-backed results.`
  console.log(JSON.stringify({
    originalQuery: result.originalQuery,
    rewrittenQuery: result.rewrittenQuery,
    detectedEntities: result.detectedEntities,
    detectedIntent: result.detectedIntent,
    retrievedSourceCounts: sourceCounts,
    finalAnswerPreview: preview,
  }, null, 2))
  history.push({ role: 'user', content: originalQuery })
  history.push({ role: 'assistant', content: preview ?? 'No preview.' })
}
