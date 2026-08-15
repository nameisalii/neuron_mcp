import { clamp01 } from './confidence'

export const HEALTH_WEIGHTS = { coverage: 0.25, freshness: 0.2, consistency: 0.2, connectivity: 0.2, distribution: 0.15 } as const
export type HealthComponents = Record<keyof typeof HEALTH_WEIGHTS, number>

export function calculateKnowledgeHealth(components: Partial<HealthComponents>) {
  const available = (Object.keys(HEALTH_WEIGHTS) as Array<keyof HealthComponents>).filter(key => Number.isFinite(components[key]))
  if (!available.length) return { score: 0, components: { coverage: 0, freshness: 0, consistency: 0, connectivity: 0, distribution: 0 }, insufficientData: true }
  const weight = available.reduce((sum, key) => sum + HEALTH_WEIGHTS[key], 0)
  const normalized = Object.fromEntries((Object.keys(HEALTH_WEIGHTS) as Array<keyof HealthComponents>).map(key => [key, Math.round(clamp01((components[key] ?? 0) / 100) * 100)])) as HealthComponents
  const score = Math.round(available.reduce((sum, key) => sum + normalized[key] * HEALTH_WEIGHTS[key], 0) / weight)
  return { score: Math.max(0, Math.min(100, score)), components: normalized, insufficientData: available.length < 3 }
}

export function deriveHealthComponents(input: { total: number; verified: number; stale: number; openContradictions: number; connected: number; isolated: number; concentrationRiskTopics: number; topics: number }): HealthComponents {
  if (!input.total) return { coverage: 0, freshness: 0, consistency: 0, connectivity: 0, distribution: 0 }
  return {
    coverage: 100 * input.verified / input.total,
    freshness: 100 * (1 - input.stale / input.total),
    consistency: 100 * (1 - Math.min(input.openContradictions, input.total) / input.total),
    connectivity: 100 * input.connected / Math.max(1, input.connected + input.isolated),
    distribution: 100 * (1 - input.concentrationRiskTopics / Math.max(1, input.topics)),
  }
}
