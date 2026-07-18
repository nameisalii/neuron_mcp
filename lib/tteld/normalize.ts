import type { TtEldActiveUnit, TtEldCurrentUnit, TtEldDriver, TtEldRealtimeUnit } from './client'

export type TtEldModule = 'realtime_units' | 'current_units' | 'drivers' | 'active_units_72h'
export interface TtEldNormalizedItem {
  externalId: string
  module: TtEldModule
  content: string
  category: 'status_update' | 'reference'
  metadata: Record<string, unknown>
  owner: string | null
  sourceCreatedAt: Date | null
}

function name(person: { first_name: string; second_name: string } | null | undefined): string | null {
  const value = [person?.first_name, person?.second_name].filter(Boolean).join(' ').trim()
  return value || null
}

function date(value: string): Date | null {
  const result = new Date(value)
  return Number.isNaN(result.getTime()) ? null : result
}

export function normalizeRealtimeUnit(unit: TtEldRealtimeUnit, now = new Date()): TtEldNormalizedItem {
  const timestamp = date(unit.timestamp)
  const freshnessSeconds = timestamp ? Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1000)) : null
  const key = unit.vin || unit.truck_number
  return {
    externalId: `fiveeld:unit:${key}`,
    module: 'realtime_units',
    category: 'status_update',
    content: [`Five ELD Unit ${unit.truck_number}`, '', `Truck: ${unit.truck_number}`, `VIN: ${unit.vin}`, `Current location: ${unit.coordinates.lat.toFixed(6)}, ${unit.coordinates.lng.toFixed(6)}`, `Last update: ${timestamp?.toISOString() ?? unit.timestamp}`].join('\n'),
    metadata: { source: 'five_eld', module: 'realtime_units', vin: unit.vin, truckNumber: unit.truck_number, coordinates: unit.coordinates, timestamp: unit.timestamp, freshnessSeconds },
    owner: null,
    sourceCreatedAt: timestamp,
  }
}

export function normalizeCurrentUnit(unit: TtEldCurrentUnit): TtEldNormalizedItem {
  const driverName = name(unit.driver)
  const codriverName = name(unit.codriver)
  return {
    externalId: `fiveeld:assignment:${unit.id || unit.vin}`,
    module: 'current_units',
    category: 'reference',
    content: ['Five ELD Assignment', '', `Truck: ${unit.truck_number}`, `Driver: ${driverName ?? 'Unassigned'}`, `Co-driver: ${codriverName ?? 'None'}`, `VIN: ${unit.vin}`, 'Status: active'].join('\n'),
    metadata: { source: 'five_eld', module: 'current_units', unitId: unit.id, vin: unit.vin, truckNumber: unit.truck_number, driverId: unit.driver?.id ?? null, driverName, codriverId: unit.codriver?.id ?? null, codriverName },
    owner: driverName,
    sourceCreatedAt: null,
  }
}

export function normalizeDriver(driver: TtEldDriver): TtEldNormalizedItem {
  const driverName = name(driver) ?? driver.id
  return {
    externalId: `fiveeld:driver:${driver.id}`,
    module: 'drivers',
    category: 'reference',
    content: ['Five ELD Driver', '', `Driver: ${driverName}`, 'Status: active', `Driver ID: ${driver.id}`].join('\n'),
    metadata: { source: 'five_eld', module: 'drivers', driverId: driver.id, driverName },
    owner: driverName,
    sourceCreatedAt: null,
  }
}

export function normalizeActiveUnit(unit: TtEldActiveUnit, bucket: string): TtEldNormalizedItem {
  return {
    externalId: `fiveeld:active-unit:${unit.id}:${bucket}`,
    module: 'active_units_72h',
    category: 'status_update',
    content: ['Five ELD Active Unit', '', `Truck: ${unit.truck_number}`, `VIN: ${unit.vin}`, `Vehicle ID: ${unit.id}`, `Active window: ${bucket}`].join('\n'),
    metadata: { source: 'five_eld', module: 'active_units_72h', vehicleId: unit.id, vin: unit.vin, truckNumber: unit.truck_number, dateBucket: bucket },
    owner: null,
    sourceCreatedAt: null,
  }
}
