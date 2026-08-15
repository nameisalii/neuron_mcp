import { clamp01 } from './confidence'

export type StaleSignals = { ageDays: number; expectedUpdateDays: number; newerRelatedCount: number; recentContradictions: number; confirmedAt?: Date | null; now?: Date }
export function calculateStaleScore(input: StaleSignals) {
  const now = input.now ?? new Date(); const confirmedAge = input.confirmedAt ? (now.getTime() - input.confirmedAt.getTime()) / 86_400_000 : input.ageDays
  const age = Math.min(0.45, Math.max(0, confirmedAge / Math.max(1, input.expectedUpdateDays) - 1) * 0.18)
  const newer = Math.min(0.35, input.newerRelatedCount * 0.1); const conflicts = Math.min(0.3, input.recentContradictions * 0.15)
  return clamp01(age + newer + conflicts)
}
export function staleReason(input: StaleSignals) { const reasons: string[] = []; if (input.ageDays > input.expectedUpdateDays) reasons.push(`not verified for ${Math.round(input.ageDays)} days`); if (input.newerRelatedCount) reasons.push(`${input.newerRelatedCount} related newer ${input.newerRelatedCount === 1 ? 'item' : 'items'}`); if (input.recentContradictions) reasons.push('recent conflicting evidence'); return reasons.join('; ') || 'No strong stale signals' }
