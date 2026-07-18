import { z } from 'zod'

export const TTELD_BASE_URL = 'https://read.tteld.com'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_PAGES = 25
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const MAX_RETRIES = 2
const MAX_HISTORY_MS = 72 * 60 * 60 * 1000

export type TtEldCredentials = { companyId?: string; usdot: string; apiKey: string; providerToken?: string }

const CoordinatesSchema = z.object({ lat: z.number().finite(), lng: z.number().finite() })
const RealtimeUnitSchema = z.object({
  truck_number: z.string(), vin: z.string(), coordinates: CoordinatesSchema, timestamp: z.string(),
})
const TrackingUnitSchema = RealtimeUnitSchema.extend({
  id: z.union([z.string(), z.number()]), rotation: z.number().finite().optional(),
  odometer: z.number().finite().optional(), speed: z.number().finite().optional(),
})
const PersonSchema = z.object({ id: z.string(), first_name: z.string(), second_name: z.string() }).nullable().optional()
const CurrentUnitSchema = z.object({
  id: z.string(), vin: z.string(), truck_number: z.string(), driver: PersonSchema, codriver: PersonSchema,
})
const DriverSchema = z.object({ id: z.string(), first_name: z.string(), second_name: z.string() })
const MetaSchema = z.object({ page: z.number().int(), perPage: z.number().int(), total: z.number().int(), totalPages: z.number().int() })
const TrackingPointSchema = z.object({
  address: z.string().optional(), coordinates: CoordinatesSchema, rotation: z.number().finite().optional(),
  speed: z.number().finite().optional(), driverId: z.string().optional(), odometer: z.number().finite().optional(), date: z.string(),
})
const ActiveUnitSchema = z.object({ id: z.string(), truck_number: z.string(), vin: z.string() })

export type TtEldRealtimeUnit = z.infer<typeof RealtimeUnitSchema>
export type TtEldTrackingUnit = z.infer<typeof TrackingUnitSchema>
export type TtEldCurrentUnit = z.infer<typeof CurrentUnitSchema>
export type TtEldDriver = z.infer<typeof DriverSchema>
export type TtEldTrackingPoint = z.infer<typeof TrackingPointSchema>
export type TtEldActiveUnit = z.infer<typeof ActiveUnitSchema>

export class TtEldError extends Error {
  constructor(
    public code: 'unauthorized' | 'not_found' | 'timeout' | 'invalid_response' | 'provider_error',
    public status?: number,
    public detailsSafe: { responseContentType?: string | null; responseTopLevelKeys?: string[]; providerTokenRequired?: boolean } = {},
  ) {
    super(code)
    this.name = 'TtEldError'
  }
}

export function validateUsdot(value: string): string {
  const usdot = value.trim()
  if (!/^\d{1,12}$/.test(usdot)) throw new TtEldError('invalid_response')
  return usdot
}

function validatePathSegment(value: string): string {
  const result = value.trim()
  if (!result || !/^[A-Za-z0-9._-]+$/.test(result)) throw new TtEldError('invalid_response')
  return result
}

function historyRange(from: Date, to: Date): { from: string; to: string } {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > MAX_HISTORY_MS) {
    throw new TtEldError('invalid_response')
  }
  return { from: from.toISOString(), to: to.toISOString() }
}

export function ttEldFriendlyError(error: unknown): string {
  if (error instanceof TtEldError) {
    if (error.code === 'unauthorized') return 'Five ELD rejected these credentials. Check your API key, provider token, Company ID, and USDOT number.'
    if (error.code === 'not_found') return 'Neuron could not find Five ELD data for this USDOT.'
    if (error.code === 'timeout') return 'Five ELD did not respond in time. Try again.'
    if (error.code === 'invalid_response') return 'Five ELD returned an unexpected response.'
  }
  return 'Neuron could not connect to Five ELD. Please check your credentials and try again.'
}

export function createTtEldClient(credentials: TtEldCredentials) {
  const usdot = validateUsdot(credentials.usdot)
  const apiKey = credentials.apiKey.trim()
  const providerToken = credentials.providerToken?.trim() ?? ''
  if (!apiKey) throw new TtEldError('unauthorized')
  const timeoutMs = Math.min(Math.max(Number(process.env.FIVE_ELD_REQUEST_TIMEOUT_MS ?? process.env.TTELD_REQUEST_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 1_000), 30_000)
  const maxPages = Math.min(Math.max(Number(process.env.FIVE_ELD_MAX_PAGES ?? process.env.TTELD_MAX_PAGES) || DEFAULT_MAX_PAGES, 1), 100)

  async function request(path: string, schema: z.ZodTypeAny, attempt = 0): Promise<unknown> {
    const url = new URL(path, TTELD_BASE_URL)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        headers: { 'x-api-key': apiKey, ...(providerToken ? { 'provider-token': providerToken } : {}), Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      })
      const responseContentType = response.headers.get('content-type')
      const responseDetails: { responseContentType: string | null; responseTopLevelKeys: string[]; providerTokenRequired?: boolean } = { responseContentType, responseTopLevelKeys: [] }
      if (response.status === 401 || response.status === 403) throw new TtEldError('unauthorized', response.status, responseDetails)
      if (response.status === 404) throw new TtEldError('not_found', 404, responseDetails)
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt))
          return request(path, schema, attempt + 1)
        }
      }
      const declaredSize = Number(response.headers.get('content-length') || 0)
      if (declaredSize > MAX_RESPONSE_BYTES) throw new TtEldError('invalid_response')
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new TtEldError('invalid_response')
      let json: unknown
      try { json = JSON.parse(text) } catch { throw new TtEldError('invalid_response', response.status, responseDetails) }
      responseDetails.responseTopLevelKeys = json && typeof json === 'object' && !Array.isArray(json) ? Object.keys(json as Record<string, unknown>).sort().slice(0, 20) : []
      const providerMessage = json && typeof json === 'object' && !Array.isArray(json) && typeof (json as Record<string, unknown>).message === 'string'
        ? String((json as Record<string, unknown>).message).toLowerCase()
        : ''
      responseDetails.providerTokenRequired = /provider.?token/.test(providerMessage) && /required|missing/.test(providerMessage)
      if (!response.ok) throw new TtEldError('provider_error', response.status, responseDetails)
      const parsed = schema.safeParse(json)
      if (!parsed.success) throw new TtEldError('invalid_response', response.status, responseDetails)
      return parsed.data
    } catch (error) {
      if (error instanceof TtEldError) throw error
      if (error instanceof Error && error.name === 'AbortError') throw new TtEldError('timeout')
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt))
        return request(path, schema, attempt + 1)
      }
      throw new TtEldError('provider_error')
    } finally { clearTimeout(timeout) }
  }

  async function paginated<T>(path: string, itemSchema: z.ZodType<T>, params: { isActive?: boolean; page?: number; perPage?: number } = {}, pageLimit = maxPages): Promise<T[]> {
    const firstPage = Math.max(1, params.page ?? 1)
    const perPage = Math.min(Math.max(params.perPage ?? 100, 1), 100)
    const items: T[] = []
    for (let page = firstPage; page < firstPage + pageLimit; page++) {
      const query = new URLSearchParams({ page: String(page), perPage: String(perPage) })
      if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
      const schema = z.object({ data: z.array(itemSchema), meta: MetaSchema })
      const result = await request(`${path}?${query}`, schema) as { data: T[]; meta: z.infer<typeof MetaSchema> }
      items.push(...result.data)
      if (page >= result.meta.totalPages) break
    }
    return items
  }

  return {
    async getRealtimeUnitsByUsdot(): Promise<TtEldRealtimeUnit[]> {
      const result = await request(`/api/v2/units-by-usdot/${encodeURIComponent(usdot)}`, z.object({ units: z.array(RealtimeUnitSchema) })) as { units: TtEldRealtimeUnit[] }
      return result.units
    },
    async getTrackingByVin(vin: string): Promise<TtEldTrackingUnit> {
      const safeVin = encodeURIComponent(validatePathSegment(vin))
      try {
        const result = await request(`/api/v2/unit-by-vin/${encodeURIComponent(usdot)}/${safeVin}`, z.object({ unit: TrackingUnitSchema })) as { unit: TtEldTrackingUnit }
        return result.unit
      } catch (error) {
        if (!(error instanceof TtEldError) || error.code !== 'not_found' || usdot === '0') throw error
        const result = await request(`/api/v2/unit-by-vin/0/${safeVin}`, z.object({ unit: TrackingUnitSchema })) as { unit: TtEldTrackingUnit }
        return result.unit
      }
    },
    getCurrentUnits(params: { isActive?: boolean; page?: number; perPage?: number } = {}) {
      return paginated(`/api/externalservice/current-units/${encodeURIComponent(usdot)}`, CurrentUnitSchema, params)
    },
    getDrivers(params: { isActive?: boolean; page?: number; perPage?: number } = {}) {
      return paginated(`/api/externalservice/drivers-list/${encodeURIComponent(usdot)}`, DriverSchema, params)
    },
    getCurrentUnitsPage(params: { isActive?: boolean; page?: number; perPage?: number } = {}) {
      return paginated(`/api/externalservice/current-units/${encodeURIComponent(usdot)}`, CurrentUnitSchema, params, 1)
    },
    getDriversPage(params: { isActive?: boolean; page?: number; perPage?: number } = {}) {
      return paginated(`/api/externalservice/drivers-list/${encodeURIComponent(usdot)}`, DriverSchema, params, 1)
    },
    async getHistoricalTrackings(params: { vehicleId: string; from: Date; to: Date }): Promise<TtEldTrackingPoint[]> {
      const range = historyRange(params.from, params.to)
      const query = new URLSearchParams(range)
      return request(`/api/externalservice/trackings/${encodeURIComponent(usdot)}/${encodeURIComponent(validatePathSegment(params.vehicleId))}/?${query}`, z.array(TrackingPointSchema)) as Promise<TtEldTrackingPoint[]>
    },
    async getActiveUnits(params: { from: Date; to: Date }): Promise<TtEldActiveUnit[]> {
      const range = historyRange(params.from, params.to)
      const query = new URLSearchParams(range)
      return request(`/api/externalservice/active-units/${encodeURIComponent(usdot)}/?${query}`, z.array(ActiveUnitSchema)) as Promise<TtEldActiveUnit[]>
    },
  }
}
