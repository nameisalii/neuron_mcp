export function isMeaningfulChange(before: unknown, after: unknown): boolean {
  const a = typeof before === 'string' ? before.trim().replace(/\s+/g, ' ') : JSON.stringify(before)
  const b = typeof after === 'string' ? after.trim().replace(/\s+/g, ' ') : JSON.stringify(after)
  if (a === b) return false; if (!a || !b) return true
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  return normalize(a) !== normalize(b)
}
export function significanceFor(changeType: string, confidence: number, evidenceCount: number) { const base: Record<string, number> = { DECISION: 0.9, PRICING: 0.9, DEADLINE: 0.8, OWNER: 0.7, PROCESS: 0.75, STATUS: 0.65, FACT: 0.6, TRIVIAL: 0.05 }; return Math.min(1, (base[changeType] ?? 0.5) * (0.7 + confidence * 0.3) + Math.min(0.1, evidenceCount * 0.02)) }
