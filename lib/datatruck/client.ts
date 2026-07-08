import { prisma } from '@/lib/db'

export const DATATRUCK_ENDPOINTS = {
  loads: '/orders/',
  drivers: '/drivers/list/',
  trucks: '/trucks/list/',
  trailers: '/trailers/list/',
  workOrders: '/work-orders/',
  dispatcherBoard: '/orders/dispatcher-board/list/',
} as const

export type DatatruckEndpointKey = keyof typeof DATATRUCK_ENDPOINTS

const COMPANY_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const DEFAULT_MAX_PAGES = Number.parseInt(process.env.DATATRUCK_MAX_PAGES ?? process.env.DATRUCK_MAX_PAGES ?? '20', 10)
const DEFAULT_MAX_RECORDS = Number.parseInt(
  process.env.DATATRUCK_MAX_RECORDS_PER_ENDPOINT ?? process.env.DATRUCK_MAX_RECORDS_PER_ENDPOINT ?? '1000',
  10,
)
const SYNC_WINDOW_PAST_DAYS = 30
const SYNC_WINDOW_FUTURE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

type DatatruckRecord = Record<string, unknown>

export interface DatatruckConnection {
  apiBaseUrl: string
  apiToken: string
}

export interface StoredDatatruckConnector {
  id: string
  apiBaseUrl: string
  encryptedCredential: string | null
  status: string
  lastSyncAt: Date | null
  metadata: unknown
}

export interface DatatruckPaginatedFetchOptions {
  maxPages?: number
  maxRecords?: number
}

export interface DatatruckPaginatedFetchResult {
  endpointKey: DatatruckEndpointKey
  records: DatatruckRecord[]
  pagesFetched: number
  countFromApi: number | null
  nextStoppedReason: 'complete' | 'max_pages' | 'max_records' | 'error'
  errors: string[]
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function requiredQueryFor(key: DatatruckEndpointKey, now: Date = new Date()): string {
  const from = formatDate(new Date(now.getTime() - SYNC_WINDOW_PAST_DAYS * DAY_MS))
  const to = formatDate(new Date(now.getTime() + SYNC_WINDOW_FUTURE_DAYS * DAY_MS))
  if (key === 'workOrders') return `?from_date=${from}&to_date=${to}`
  if (key === 'dispatcherBoard') return `?start_date=${from}&end_date=${to}`
  return ''
}

function datatruckLimit(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  return fallback
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function normalizeEndpointUrl(baseUrl: string, pathOrUrl: string): string {
  if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl
  const trimmedBase = cleanBaseUrl(baseUrl)
  if (pathOrUrl.startsWith('?')) return `${trimmedBase}${pathOrUrl}`
  if (pathOrUrl.startsWith('/')) return `${trimmedBase}${pathOrUrl}`
  return `${trimmedBase}/${pathOrUrl}`
}

function parseRecords(payload: unknown): { records: DatatruckRecord[]; next: string | null; countFromApi: number | null } {
  if (Array.isArray(payload)) {
    return {
      records: payload.filter((record): record is DatatruckRecord => Boolean(record) && typeof record === 'object' && !Array.isArray(record)),
      next: null,
      countFromApi: payload.length,
    }
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const data = payload as Record<string, unknown>
    const records = Array.isArray(data.results)
      ? data.results.filter((record): record is DatatruckRecord => Boolean(record) && typeof record === 'object' && !Array.isArray(record))
      : Array.isArray(data.data)
        ? data.data.filter((record): record is DatatruckRecord => Boolean(record) && typeof record === 'object' && !Array.isArray(record))
        : []
    const next = typeof data.next === 'string' && data.next ? data.next : null
    const countFromApi = typeof data.count === 'number' && Number.isFinite(data.count) ? data.count : null
    return { records, next, countFromApi }
  }

  return { records: [], next: null, countFromApi: null }
}

/**
 * Normalizes user input into a bare Datatruck company name.
 * Accepts "sflogistics", "sflogistics.datatruck.io", or a full URL.
 */
export function normalizeDatatruckCompanyName(input: string): string {
  let name = input.trim().toLowerCase()
  name = name.replace(/^https?:\/\//, '')
  name = name.split('/')[0] ?? ''
  const suffixIndex = name.indexOf('.datatruck.io')
  if (suffixIndex >= 0) name = name.slice(0, suffixIndex)
  return name.replace(/\s+/g, '')
}

export function isValidDatatruckCompanyName(name: string): boolean {
  return COMPANY_NAME_PATTERN.test(name)
}

export function buildDatatruckApiBaseUrl(companyName: string): string {
  return `https://${companyName}.datatruck.io/api/v1/openapi`
}

export function buildDatatruckUrl(connection: Pick<DatatruckConnection, 'apiBaseUrl'>, endpointOrUrl: string): string {
  return normalizeEndpointUrl(connection.apiBaseUrl, endpointOrUrl)
}

export function datatruckEndpointUrl(connection: Pick<DatatruckConnection, 'apiBaseUrl'>, key: DatatruckEndpointKey): string {
  return `${cleanBaseUrl(connection.apiBaseUrl)}${DATATRUCK_ENDPOINTS[key]}${requiredQueryFor(key)}`
}

export function datatruckAuthHeaders(apiToken: string): Record<string, string> {
  return {
    Authorization: `Token ${apiToken}`,
    'Content-Type': 'application/json',
  }
}

export function safeDatatruckMetadata(companyName: string) {
  return {
    companyName,
    apiBaseUrlConfigured: true,
    apiTokenConfigured: true,
    authHeader: 'Authorization',
    authScheme: 'Token',
    endpoints: DATATRUCK_ENDPOINTS,
  }
}

export interface DatatruckEnvConfig {
  companyName?: string
  apiBaseUrl?: string
  apiToken?: string
}

export function getDatatruckEnvConfig(): DatatruckEnvConfig {
  const apiToken = process.env.DATATRUCK_API_TOKEN || process.env.DATATRUCK_API_KEY || undefined
  const rawCompanyName = process.env.DATATRUCK_COMPANY_NAME
  const companyName = rawCompanyName ? normalizeDatatruckCompanyName(rawCompanyName) : undefined
  const derivedBaseUrl = companyName && isValidDatatruckCompanyName(companyName)
    ? buildDatatruckApiBaseUrl(companyName)
    : undefined
  return {
    companyName: companyName || undefined,
    apiBaseUrl: process.env.DATATRUCK_API_BASE_URL || derivedBaseUrl,
    apiToken,
  }
}

export function isDatatruckEnvConfigured(config: DatatruckEnvConfig = getDatatruckEnvConfig()): boolean {
  return Boolean(config.apiBaseUrl && config.apiToken)
}

export function getStoredDatatruckConnector(workspaceId: string): Promise<StoredDatatruckConnector | null> {
  return prisma.apiConnector.findUnique({
    where: { workspaceId_sourceKey: { workspaceId, sourceKey: 'datatruck' } },
    select: {
      id: true,
      apiBaseUrl: true,
      encryptedCredential: true,
      status: true,
      lastSyncAt: true,
      metadata: true,
    },
  })
}

export function datatruckRequest(connection: DatatruckConnection, endpointOrUrl: string): Promise<Response> {
  return fetch(buildDatatruckUrl(connection, endpointOrUrl), {
    method: 'GET',
    headers: datatruckAuthHeaders(connection.apiToken),
    cache: 'no-store',
  })
}

export async function fetchDatatruckPaginated(
  connection: DatatruckConnection,
  endpointKey: DatatruckEndpointKey,
  options: DatatruckPaginatedFetchOptions = {},
): Promise<DatatruckPaginatedFetchResult> {
  const maxPages = datatruckLimit(options.maxPages, DEFAULT_MAX_PAGES)
  const maxRecords = datatruckLimit(options.maxRecords, DEFAULT_MAX_RECORDS)
  const records: DatatruckRecord[] = []
  const errors: string[] = []
  let nextUrl: string | null = datatruckEndpointUrl(connection, endpointKey)
  let pagesFetched = 0
  let countFromApi: number | null = null
  let nextStoppedReason: DatatruckPaginatedFetchResult['nextStoppedReason'] = 'complete'

  while (nextUrl && pagesFetched < maxPages && records.length < maxRecords) {
    const response = await datatruckRequest(connection, nextUrl)
    pagesFetched++
    if (!response.ok) {
      errors.push(`HTTP ${response.status}`)
      nextStoppedReason = 'error'
      break
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      errors.push('Invalid JSON')
      nextStoppedReason = 'error'
      break
    }

    const parsed = parseRecords(payload)
    countFromApi = parsed.countFromApi ?? countFromApi
    const remaining = maxRecords - records.length
    records.push(...parsed.records.slice(0, remaining))

    if (records.length >= maxRecords) {
      nextStoppedReason = 'max_records'
      break
    }

    if (!parsed.next) {
      nextStoppedReason = 'complete'
      break
    }

    const normalizedNext = buildDatatruckUrl(connection, parsed.next)
    if (normalizedNext === nextUrl) {
      errors.push('Pagination loop detected')
      nextStoppedReason = 'error'
      break
    }
    nextUrl = normalizedNext

    if (pagesFetched >= maxPages) {
      nextStoppedReason = 'max_pages'
      break
    }
  }

  if (records.length >= maxRecords) nextStoppedReason = 'max_records'
  else if (pagesFetched >= maxPages && nextUrl) nextStoppedReason = 'max_pages'

  return { endpointKey, records, pagesFetched, countFromApi, nextStoppedReason, errors }
}

export interface DatatruckEndpointResult {
  key: DatatruckEndpointKey
  path: string
  ok: boolean
  status: number | null
  records: number
}

export async function fetchDatatruckEndpoint(
  connection: DatatruckConnection,
  key: DatatruckEndpointKey,
): Promise<DatatruckEndpointResult> {
  const path = DATATRUCK_ENDPOINTS[key]
  const url = datatruckEndpointUrl(connection, key)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: datatruckAuthHeaders(connection.apiToken),
      cache: 'no-store',
    })
    if (!response.ok) return { key, path, ok: false, status: response.status, records: 0 }
    let records = 0
    try {
      records = parseRecords(await response.json()).records.length
    } catch {
      records = 0
    }
    return { key, path, ok: true, status: response.status, records }
  } catch {
    return { key, path, ok: false, status: null, records: 0 }
  }
}

export interface DatatruckSyncResult {
  ok: boolean
  fetched: number
  endpoints: DatatruckEndpointResult[]
  failedEndpoints: DatatruckEndpointKey[]
}

export async function syncDatatruckData(connection: DatatruckConnection): Promise<DatatruckSyncResult> {
  const keys = Object.keys(DATATRUCK_ENDPOINTS) as DatatruckEndpointKey[]
  const endpoints = await Promise.all(keys.map((key) => fetchDatatruckEndpoint(connection, key)))
  const failedEndpoints = endpoints.filter((endpoint) => !endpoint.ok).map((endpoint) => endpoint.key)
  return {
    ok: failedEndpoints.length === 0,
    fetched: endpoints.reduce((sum, endpoint) => sum + endpoint.records, 0),
    endpoints,
    failedEndpoints,
  }
}
