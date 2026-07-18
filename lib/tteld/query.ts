import type { QuerySource } from '@/lib/query/source-ranking'
import { createTtEldClient, type TtEldCurrentUnit, type TtEldTrackingPoint, type TtEldTrackingUnit } from './client'
import { loadTtEldConnection } from './credentials'

export interface TtEldLiveAnswer { answer: string; sources: QuerySource[] }

export function isTtEldLiveQuestion(query: string): boolean {
  return /\b(five\s*eld|tt\s*eld|eld|truck\s*gps|truck\s*location|driver\s*location|fleet\s*location|gps|vin|truck\s*[#-]?\s*[a-z0-9]+|driver.+(?:where|location)|where.+driver|route today|currently moving|stale gps|active.+72 hours)\b/i.test(query)
}

function fullName(person: TtEldCurrentUnit['driver']): string {
  return [person?.first_name, person?.second_name].filter(Boolean).join(' ').trim()
}

function age(timestamp: string): { text: string; stale: boolean; seconds: number } {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
  const text = seconds < 60 ? 'just now' : seconds < 3600 ? `${Math.floor(seconds / 60)} minutes ago` : `${Math.floor(seconds / 3600)} hours ago`
  return { text, stale: seconds > 30 * 60, seconds }
}

function heading(rotation?: number): string | null {
  if (rotation === undefined) return null
  const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
  return `${directions[Math.round((((rotation % 360) + 360) % 360) / 45) % 8]}, ${Math.round(rotation)}°`
}

function liveSource(content: string, metadata: Record<string, unknown>, id = 'fleet'): QuerySource {
  return { chunkId: `live-fiveeld-${id}`, pageId: null, pageTitle: 'Live Five ELD API', notionPageId: null, content, labels: ['Live Five ELD API'], source: 'five_eld', sourceUrl: '/dashboard/integrations/five-eld', sourceExternalId: id, owner: null, sourceMetadata: { ...metadata, title: 'Live Five ELD API', live: true }, sourceCreatedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), relevanceScore: 1 }
}

function locationAnswer(unit: TtEldTrackingUnit, assignment?: TtEldCurrentUnit): TtEldLiveAnswer {
  const freshness = age(unit.timestamp)
  const driver = assignment ? fullName(assignment.driver) : ''
  const lines = [
    'Current Five ELD location', '',
    `Truck ${unit.truck_number} is at ${unit.coordinates.lat.toFixed(6)}, ${unit.coordinates.lng.toFixed(6)}.`, '',
    driver ? `- Driver: ${driver}` : null,
    `- VIN: ${unit.vin}`,
    unit.speed !== undefined ? `- Speed: ${unit.speed} mph` : null,
    heading(unit.rotation) ? `- Heading: ${heading(unit.rotation)}` : null,
    unit.odometer !== undefined ? `- Odometer: ${unit.odometer.toLocaleString()} mi` : null,
    `- Last update: ${freshness.text}`,
    '', 'Map coordinates:', `${unit.coordinates.lat.toFixed(6)}, ${unit.coordinates.lng.toFixed(6)}`,
    '', 'Five ELD returned coordinates but no street address.',
    freshness.stale ? '' : null, freshness.stale ? 'This GPS point is stale.' : null,
  ].filter((line): line is string => line !== null).join('\n')
  return { answer: lines, sources: [liveSource(lines, { vin: unit.vin, truckNumber: unit.truck_number, driverName: driver || null, coordinates: unit.coordinates, speed: unit.speed ?? null, rotation: unit.rotation ?? null, odometer: unit.odometer ?? null, timestamp: unit.timestamp, freshnessSeconds: freshness.seconds }, unit.vin)] }
}

export async function findTruckByNumberOrVin(client: ReturnType<typeof createTtEldClient>, query: string) {
  const [assignmentsResult, realtimeResult] = await Promise.allSettled([client.getCurrentUnits({ isActive: true }), client.getRealtimeUnitsByUsdot()])
  const assignments = assignmentsResult.status === 'fulfilled' ? assignmentsResult.value : []
  const realtime = realtimeResult.status === 'fulfilled' ? realtimeResult.value : []
  const normalized = query.toLowerCase()
  const candidates = [...assignments.map((item) => ({ truck: item.truck_number, vin: item.vin })), ...realtime.map((item) => ({ truck: item.truck_number, vin: item.vin }))]
  const match = candidates.find((item) => normalized.includes(item.vin.toLowerCase()) || normalized.includes(item.truck.toLowerCase()))
  return { match, assignments }
}

export async function findDriverByName(client: ReturnType<typeof createTtEldClient>, query: string) {
  const assignments = await client.getCurrentUnits({ isActive: true })
  const normalized = query.toLowerCase()
  return assignments.find((item) => {
    const driver = fullName(item.driver).toLowerCase()
    return driver && (normalized.includes(driver) || driver.split(/\s+/).some((part) => part.length > 2 && normalized.includes(part)))
  }) ?? null
}

export async function getLatestLocationForTruck(client: ReturnType<typeof createTtEldClient>, query: string): Promise<TtEldLiveAnswer | null> {
  const { match, assignments } = await findTruckByNumberOrVin(client, query)
  if (!match) return null
  const unit = await client.getTrackingByVin(match.vin)
  return locationAnswer(unit, assignments.find((item) => item.vin === match.vin))
}

export async function getLatestLocationForDriver(client: ReturnType<typeof createTtEldClient>, query: string): Promise<TtEldLiveAnswer | null> {
  const assignment = await findDriverByName(client, query)
  if (!assignment) return null
  return locationAnswer(await client.getTrackingByVin(assignment.vin), assignment)
}

function distanceMiles(points: TtEldTrackingPoint[]): number {
  let miles = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!.coordinates; const b = points[i]!.coordinates
    const lat = (b.lat - a.lat) * Math.PI / 180; const lng = (b.lng - a.lng) * Math.PI / 180
    const x = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(lng / 2) ** 2
    miles += 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  }
  return miles
}

export async function getRouteHistoryForTruckToday(client: ReturnType<typeof createTtEldClient>, query: string): Promise<TtEldLiveAnswer | null> {
  const { match, assignments } = await findTruckByNumberOrVin(client, query)
  if (!match) return null
  const vehicleId = assignments.find((item) => item.vin === match.vin)?.id
  if (!vehicleId) return null
  const to = new Date(); const from = new Date(to); from.setHours(0, 0, 0, 0)
  const points = await client.getHistoricalTrackings({ vehicleId, from, to })
  if (!points.length) return null
  const first = points[0]!; const last = points[points.length - 1]!
  const answer = ['Five ELD route today', '', `Truck ${match.truck} has ${points.length} route points today.`, `- First: ${first.address || `${first.coordinates.lat.toFixed(6)}, ${first.coordinates.lng.toFixed(6)}`}`, `- Latest: ${last.address || `${last.coordinates.lat.toFixed(6)}, ${last.coordinates.lng.toFixed(6)}`}`, `- Approximate tracked distance: ${distanceMiles(points).toFixed(1)} miles`].join('\n')
  return { answer, sources: [liveSource(answer, { module: 'historical_route_today', vin: match.vin, truckNumber: match.truck, vehicleId, points: points.length }, `route-${match.vin}`)] }
}

export async function getFleetStatusSummary(client: ReturnType<typeof createTtEldClient>): Promise<TtEldLiveAnswer> {
  const assignments = await client.getCurrentUnits({ isActive: true })
  const live = await Promise.allSettled(assignments.slice(0, 100).map((item) => client.getTrackingByVin(item.vin)))
  const units = live.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
  const moving = units.filter((unit) => (unit.speed ?? 0) > 0)
  const stale = units.filter((unit) => age(unit.timestamp).stale)
  const answer = ['Latest Five ELD updates', '', `- Current assignments: ${assignments.length}`, `- Live locations found: ${units.length}`, `- Trucks currently moving: ${moving.length}${moving.length ? ` (${moving.map((unit) => unit.truck_number).join(', ')})` : ''}`, `- Trucks with stale GPS: ${stale.length}${stale.length ? ` (${stale.map((unit) => unit.truck_number).join(', ')})` : ''}`, `- Active drivers: ${assignments.filter((item) => item.driver).length}`].join('\n')
  return { answer, sources: [liveSource(answer, { module: 'fleet_status', assignments: assignments.length, liveUnits: units.length, movingTrucks: moving.map((unit) => unit.truck_number), staleTrucks: stale.map((unit) => unit.truck_number) })] }
}

async function getAssignmentForTruck(client: ReturnType<typeof createTtEldClient>, query: string): Promise<TtEldLiveAnswer | null> {
  const { match, assignments } = await findTruckByNumberOrVin(client, query)
  const assignment = match ? assignments.find((item) => item.vin === match.vin) : null
  if (!assignment) return null
  const driver = fullName(assignment.driver) || 'Unassigned'
  const codriver = fullName(assignment.codriver) || 'None'
  const answer = ['Current Five ELD assignment', '', `- Truck: ${assignment.truck_number}`, `- Driver: ${driver}`, `- Co-driver: ${codriver}`, `- VIN: ${assignment.vin}`].join('\n')
  return { answer, sources: [liveSource(answer, { module: 'current_units', truckNumber: assignment.truck_number, vin: assignment.vin, driverName: driver, codriverName: codriver }, `assignment-${assignment.id}`)] }
}

async function getActiveUnits72Hours(client: ReturnType<typeof createTtEldClient>): Promise<TtEldLiveAnswer> {
  const to = new Date(); const from = new Date(to.getTime() - 72 * 60 * 60 * 1000)
  const units = await client.getActiveUnits({ from, to })
  const answer = ['Five ELD units active in the last 72 hours', '', units.length ? units.map((unit) => `- Truck ${unit.truck_number} · VIN ${unit.vin}`).join('\n') : 'No active units were returned for this period.'].join('\n')
  return { answer, sources: [liveSource(answer, { module: 'active_units_72h', activeUnits: units.length }, 'active-72h')] }
}

export async function answerTtEldLocationQuestion(workspaceId: string, query: string): Promise<TtEldLiveAnswer | null> {
  const connection = await loadTtEldConnection(workspaceId)
  if (!connection) return null
  const client = createTtEldClient(connection.credentials)
  try {
    if (/\broute|trackings?|where.*today\b/i.test(query)) return await getRouteHistoryForTruckToday(client, query)
    if (/\bactive\b.*\b72\s*hours?\b|\blast\s*72\s*hours?\b/i.test(query)) return await getActiveUnits72Hours(client)
    if (/\b(?:which|what)\s+driver\b|\bassigned\s+to\s+truck\b/i.test(query)) return await getAssignmentForTruck(client, query)
    if (/\bdriver\b/i.test(query) && /\bwhere|location|gps\b/i.test(query)) return await getLatestLocationForDriver(client, query)
    if (/\bwhere|location|gps|vin\b/i.test(query) && /\btruck|vin\b/i.test(query)) return await getLatestLocationForTruck(client, query)
    return await getFleetStatusSummary(client)
  } catch {
    return { answer: 'Five ELD connection is valid and truck assignments are available, but the live GPS endpoint is not enabled or not available for this account yet.', sources: [] }
  }
}
