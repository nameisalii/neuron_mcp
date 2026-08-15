export const RISK_CONFIG = { minimumEvidence: 5, highConcentration: 0.6 } as const
export type Contribution = { topic: string; person: string; ownership?: number; authored?: number; decisions?: number; expertise?: number; unique?: number }
export function calculateConcentration(rows: Contribution[]) {
  const topics = new Map<string, Map<string, number>>()
  for (const row of rows) { const score = (row.ownership ?? 0) * 3 + (row.decisions ?? 0) * 2.5 + (row.unique ?? 0) * 2 + (row.expertise ?? 0) * 1.5 + (row.authored ?? 0); const people = topics.get(row.topic) ?? new Map(); people.set(row.person, (people.get(row.person) ?? 0) + score); topics.set(row.topic, people) }
  return [...topics].map(([topic, people]) => { const total = [...people.values()].reduce((a, b) => a + b, 0); const distribution = [...people].map(([person, score]) => ({ person, percentage: total ? score / total : 0, score })).sort((a, b) => b.score - a.score); return { topic, totalEvidence: total, distribution, highRisk: total >= RISK_CONFIG.minimumEvidence && (distribution[0]?.percentage ?? 0) >= RISK_CONFIG.highConcentration } })
}
