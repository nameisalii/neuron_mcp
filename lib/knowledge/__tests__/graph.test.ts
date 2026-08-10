import { buildKnowledgeGraph, MAX_GRAPH_EDGES, MAX_GRAPH_NODES, type GraphKnowledgeRow } from '../graph'

function item(overrides: Partial<GraphKnowledgeRow> = {}): GraphKnowledgeRow {
  return {
    id: overrides.id ?? 'item-1',
    content: overrides.content ?? 'The Trade Desk campaign launch is ready.',
    summary: overrides.summary ?? 'Campaign launch details.',
    reason: null,
    label: overrides.label ?? null,
    category: overrides.category ?? 'fact',
    source: overrides.source ?? 'gmail',
    sourceExternalId: overrides.sourceExternalId ?? null,
    sourceMetadata: overrides.sourceMetadata ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-08-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-08-02T00:00:00Z'),
    verified: overrides.verified ?? false,
    confidence: overrides.confidence ?? 0.8,
  }
}

test('groups by source and detected entity without exposing full bodies', () => {
  const privateBody = `Private email ${'secret '.repeat(100)}`
  const graph = buildKnowledgeGraph([
    item({ id: 'one', content: privateBody, sourceMetadata: { company: 'The Trade Desk', subject: 'Launch plan' } }),
    item({ id: 'two', source: 'gmail', content: 'The Trade Desk launch owner.' }),
  ])
  expect(graph.nodes.find(node => node.id === 'source:gmail')?.knowledgeCount).toBe(2)
  expect(graph.nodes.find(node => node.id === 'entity:the-trade-desk')?.knowledgeCount).toBe(2)
  expect(JSON.stringify(graph)).not.toContain(privateBody)
  expect(graph.nodes.flatMap(node => node.topItems).every(top => top.summary.length <= 180)).toBe(true)
})

test('uses log-scaled sizes and relationship counts for edge weights', () => {
  const rows = [
    item({ id: 'one', source: 'gmail', sourceMetadata: { entity: 'Neuron' } }),
    item({ id: 'two', source: 'gmail', sourceMetadata: { entity: 'Neuron' } }),
    item({ id: 'three', source: 'slack', sourceMetadata: { entity: 'Neuron' } }),
  ]
  const graph = buildKnowledgeGraph(rows)
  expect(graph.nodes.find(node => node.label === 'Gmail')!.size).toBeGreaterThan(graph.nodes.find(node => node.label === 'Slack')!.size)
  const edge = graph.edges.find(value => value.from.includes('neuron') || value.to.includes('neuron'))!
  expect(edge.relatedCount).toBeGreaterThan(0)
  expect(edge.weight).toBeGreaterThan(0.75)
})

test('caps graph size and handles malformed metadata and empty knowledge', () => {
  const rows = Array.from({ length: 80 }, (_, index) => item({ id: String(index), source: `source-${index}`, sourceMetadata: index % 2 ? 'malformed' : null }))
  const graph = buildKnowledgeGraph(rows)
  expect(graph.nodes.length).toBeLessThanOrEqual(MAX_GRAPH_NODES)
  expect(graph.edges.length).toBeLessThanOrEqual(MAX_GRAPH_EDGES)
  expect(buildKnowledgeGraph([])).toEqual({ nodes: [], edges: [], stats: { totalKnowledge: 0, totalSources: 0, totalEdges: 0, largestNodeSize: 0 } })
})
