export const PROCESS_MIN_OBSERVATIONS = 3
export type ProcessObservation = { instanceId: string; step: string; at: Date; evidenceId: string; participant?: string }
export function discoverRepeatedProcesses(observations: ProcessObservation[]) {
  const instances = new Map<string, ProcessObservation[]>(); for (const row of observations) instances.set(row.instanceId, [...(instances.get(row.instanceId) ?? []), row])
  const patterns = new Map<string, ProcessObservation[][]>()
  for (const rows of instances.values()) { const sorted = rows.sort((a, b) => a.at.getTime() - b.at.getTime()); const key = sorted.map(row => row.step.toLowerCase().trim()).join('→'); patterns.set(key, [...(patterns.get(key) ?? []), sorted]) }
  return [...patterns].filter(([, runs]) => runs.length >= PROCESS_MIN_OBSERVATIONS).map(([key, runs]) => ({ name: runs[0].map(row => row.step).join(' → '), steps: runs[0].map((row, index) => ({ order: index + 1, name: row.step, evidenceIds: [...new Set(runs.flatMap(run => run[index]?.evidenceId).filter(Boolean))] })), frequency: runs.length, averageDurationMs: Math.round(runs.reduce((sum, run) => sum + run.at(-1)!.at.getTime() - run[0].at.getTime(), 0) / runs.length), participants: [...new Set(runs.flatMap(run => run.map(row => row.participant).filter(Boolean)))], confidence: Math.min(0.95, 0.55 + runs.length * 0.1), fingerprint: key }))
}
