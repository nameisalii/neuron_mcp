import { createTtEldClient, TtEldError, type TtEldCredentials } from './client'

export type FiveEldCapabilities = {
  currentUnits: boolean
  drivers: boolean
  realtimeUnitsByUsdot: boolean
  unitByVin: 'unknown' | boolean
  historicalTracking: 'unknown' | boolean
}

export type FiveEldProbeFailure = {
  stage: 'current_units' | 'drivers' | 'realtime_units_by_usdot'
  error: unknown
}

export type FiveEldProbeResult = {
  ok: boolean
  capabilities: FiveEldCapabilities
  warnings: Array<{ code: string; message: string }>
  counts: { currentUnits: number; drivers: number; realtimeUnits: number }
  failures: FiveEldProbeFailure[]
}

export async function probeFiveEldCapabilities(credentials: TtEldCredentials): Promise<FiveEldProbeResult> {
  const client = createTtEldClient(credentials)
  const capabilities: FiveEldCapabilities = { currentUnits: false, drivers: false, realtimeUnitsByUsdot: false, unitByVin: 'unknown', historicalTracking: 'unknown' }
  const counts = { currentUnits: 0, drivers: 0, realtimeUnits: 0 }
  const failures: FiveEldProbeFailure[] = []

  const probes = [
    { stage: 'current_units' as const, run: () => client.getCurrentUnitsPage({ page: 1, perPage: 1, isActive: true }), success: (items: unknown[]) => { capabilities.currentUnits = true; counts.currentUnits = items.length } },
    { stage: 'drivers' as const, run: () => client.getDriversPage({ page: 1, perPage: 1, isActive: true }), success: (items: unknown[]) => { capabilities.drivers = true; counts.drivers = items.length } },
    { stage: 'realtime_units_by_usdot' as const, run: () => client.getRealtimeUnitsByUsdot(), success: (items: unknown[]) => { capabilities.realtimeUnitsByUsdot = true; counts.realtimeUnits = items.length } },
  ]

  for (const probe of probes) {
    try { probe.success(await probe.run()) } catch (error) { failures.push({ stage: probe.stage, error }) }
  }

  const ok = capabilities.currentUnits || capabilities.drivers || capabilities.realtimeUnitsByUsdot
  const warnings = ok && !capabilities.realtimeUnitsByUsdot
    ? [{ code: 'realtime_units_by_usdot_unavailable', message: 'The real-time USDOT endpoint was not available for this account, but current units/drivers are accessible.' }]
    : []
  return { ok, capabilities, warnings, counts, failures }
}

export function primaryProbeError(result: FiveEldProbeResult): FiveEldProbeFailure | null {
  return result.failures.find(({ error }) => error instanceof TtEldError && (error.code === 'unauthorized' || error.detailsSafe.providerTokenRequired))
    ?? result.failures.find(({ error }) => error instanceof TtEldError && error.code !== 'not_found')
    ?? result.failures[0]
    ?? null
}
