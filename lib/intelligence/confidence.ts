export const CONFIDENCE = { high: 0.9, medium: 0.7 } as const

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function confidenceLabel(value: number): 'High' | 'Medium' | 'Low' {
  return value >= CONFIDENCE.high ? 'High' : value >= CONFIDENCE.medium ? 'Medium' : 'Low'
}
