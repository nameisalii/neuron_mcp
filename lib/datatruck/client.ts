import { prisma } from '@/lib/db'
import { isAllowedDatatruckUrl } from './urlSafety'

export const DATATRUCK_ENDPOINTS = {
  loads: '/orders/',
  drivers: '/drivers/list/',
  trucks: '/trucks/list/',
  trailers: '/trailers/list/',
  workOrders: '/work-orders/',
  dispatcherBoard: '/orders/dispatcher-board/list/',
} as const

export const DATATRUCK_OPTIONAL_ENDPOINTS = {
  liveLoads: 'DATATRUCK_LIVE_LOADS_ENDPOINT',
  myLoads: 'DATATRUCK_MY_LOADS_ENDPOINT',
  ltlTrips: 'DATATRUCK_LTL_TRIPS_ENDPOINT',
  loadboard: 'DATATRUCK_LOADBOARD_ENDPOINT',
  planningBoard: 'DATATRUCK_PLANNING_BOARD_ENDPOINT',
  invoices: 'DATATRUCK_INVOICES_ENDPOINT',
  bills: 'DATATRUCK_BILLS_ENDPOINT',
  payroll: 'DATATRUCK_PAYROLL_ENDPOINT',
  dispatchers: 'DATATRUCK_DISPATCHERS_ENDPOINT',
  vendors: 'DATATRUCK_VENDORS_ENDPOINT',
  charges: 'DATATRUCK_CHARGES_ENDPOINT',
  transactions: 'DATATRUCK_TRANSACTIONS_ENDPOINT',
  customers: 'DATATRUCK_CUSTOMERS_ENDPOINT',
  safetyTasks: 'DATATRUCK_SAFETY_TASKS_ENDPOINT',
  compliance: 'DATATRUCK_COMPLIANCE_ENDPOINT',
  inspections: 'DATATRUCK_INSPECTIONS_ENDPOINT',
  fleetBoard: 'DATATRUCK_FLEET_BOARD_ENDPOINT',
  inventory: 'DATATRUCK_INVENTORY_ENDPOINT',
  fleetIssues: 'DATATRUCK_FLEET_ISSUES_ENDPOINT',
  users: 'DATATRUCK_USERS_ENDPOINT',
  reports: 'DATATRUCK_REPORTS_ENDPOINT',
  fuel: 'DATATRUCK_FUEL_ENDPOINT',
  toll: 'DATATRUCK_TOLL_ENDPOINT',
  moneyCode: 'DATATRUCK_MONEY_CODE_ENDPOINT',
  cashAdvance: 'DATATRUCK_CASH_ADVANCE_ENDPOINT',
  scale: 'DATATRUCK_SCALE_ENDPOINT',
  mailbox: 'DATATRUCK_MAILBOX_ENDPOINT',
} as const

export const DATATRUCK_FULL_ACCOUNT_ENDPOINTS: Partial<Record<DatatruckEndpointKey, string>> = {
  loads: '/api/v2/order/list/full/?page=1&page_size=20&filter=%5B%5D&ordering=',
  liveLoads: '/api/v2/order/list/full/?page=1&page_size=20&filter=%5B%7B%22column%22%3A%22status%22%2C%22contains%22%3A%22in%22%2C%22value%22%3A%5B%22dispatched%22%2C%22in_transit%22%5D%7D%5D&ordering=',
  myLoads: '/api/v2/order/my-loads/?page=1&page_size=20&filter=%5B%5D&ordering=',
  ltlTrips: '/api/v1/ltl/list/?page=1&page_size=20&filter=%5B%5D&ordering=',
  dispatcherBoard: '/api/v2/planning_calendar/dispatch-board/drivers/?page=1&page_size=25',
  invoices: '/api/v1/invoice/batches/list/?page=1&page_size=20&filter=%5B%5D&ordering=',
  payroll: '/api/v1/salary/batches/list/?page=1&page_size=20&filter=%5B%5D&ordering=',
  customers: '/api/v1/customer/?page=1&page_size=20&filter=%5B%5D&ordering=',
  vendors: '/api/v1/vendor/?page=1&page_size=20&filter=%5B%5D&ordering=',
  trucks: '/api/v2/truck/truck/?page=1&page_size=20&filter=%5B%7B%22contains%22%3A%22is_not%22%2C%22value%22%3A%22inactive%22%2C%22column%22%3A%22status%22%7D%5D&ordering=-id',
  drivers: '/api/v2/driver/list/?page=1&page_size=20&filter=%5B%7B%22contains%22%3A%22is%22%2C%22value%22%3A%22active%22%2C%22column%22%3A%22new_employee_status%22%7D%5D&ordering=',
  fuel: '/api/v1/fuel/transactions/?ordering=&page=1&page_size=20&filter=%5B%7B%22contains%22%3A%22contains%22%2C%22value%22%3A%22fuel%22%2C%22column%22%3A%22transaction_type%22%7D%5D',
  toll: '/api/v1/toll/transactions/?ordering=&page=1&page_size=20&filter=%5B%5D',
  scale: '/api/v1/fuel/transactions/card-numbers?filter=%5B%7B%22contains%22%3A%22contains%22%2C%22value%22%3A%22scale%22%2C%22column%22%3A%22transaction_type%22%7D%5D&search=&page=1&page_size=20',
}

const CONFIRMED_ENDPOINT_ENV_KEYS: Record<keyof typeof DATATRUCK_ENDPOINTS, string> = {
  loads: 'DATATRUCK_LOADS_ENDPOINT',
  drivers: 'DATATRUCK_DRIVERS_ENDPOINT',
  trucks: 'DATATRUCK_TRUCKS_ENDPOINT',
  trailers: 'DATATRUCK_TRAILERS_ENDPOINT',
  workOrders: 'DATATRUCK_WORK_ORDERS_ENDPOINT',
  dispatcherBoard: 'DATATRUCK_DISPATCHER_BOARD_ENDPOINT',
}

export const DATATRUCK_ENDPOINT_LABELS = {
  loads: 'Loads',
  drivers: 'Drivers',
  trucks: 'Trucks',
  trailers: 'Trailers',
  workOrders: 'Work orders',
  dispatcherBoard: 'Dispatcher board',
  liveLoads: 'Live loads',
  myLoads: 'My loads',
  ltlTrips: 'LTL trips',
  loadboard: 'Loadboard',
  planningBoard: 'Planning board',
  invoices: 'Invoices',
  bills: 'Bills',
  payroll: 'Payroll',
  dispatchers: 'Dispatchers',
  vendors: 'Vendors',
  charges: 'Charges',
  transactions: 'Transactions',
  customers: 'Customers',
  safetyTasks: 'Safety tasks',
  compliance: 'Compliance',
  inspections: 'Inspections',
  fleetBoard: 'Fleet board',
  inventory: 'Inventory',
  fleetIssues: 'Fleet issues',
  users: 'Users',
  reports: 'Reports',
  fuel: 'Fuel',
  toll: 'Toll',
  moneyCode: 'Money code',
  cashAdvance: 'Cash advance',
  scale: 'Scale',
  mailbox: 'Mailbox',
} as const

export type DatatruckEndpointKey = keyof typeof DATATRUCK_ENDPOINT_LABELS

export interface DatatruckEndpointConfig {
  key: DatatruckEndpointKey
  label: string
  path: string | null
  defaultPath: string | null
  envVar: string | null
  configuredBy: 'metadata' | 'env' | 'default' | 'not_mapped'
  confirmed: boolean
}

export type DatatruckEndpointMapping = Partial<Record<DatatruckEndpointKey, string>>

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

export interface DatatruckInternalConnection {
  companyName: string
  workspaceId: string
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
  path?: string
  request?: (endpointOrUrl: string) => Promise<Response>
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

function isDatatruckEndpointKey(value: string): value is DatatruckEndpointKey {
  return Object.prototype.hasOwnProperty.call(DATATRUCK_ENDPOINT_LABELS, value)
}

function normalizedPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/[\r\n]/.test(trimmed)) return null
  // Absolute URLs in endpoint mappings must stay on datatruck.io over HTTPS;
  // anything else is dropped so a poisoned mapping can never reach other hosts.
  if (isAbsoluteUrl(trimmed)) return isAllowedDatatruckUrl(trimmed) ? trimmed : null
  if (trimmed.includes('..')) return null
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function parseDatatruckEndpointMapping(metadata: unknown): DatatruckEndpointMapping {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const raw = (metadata as Record<string, unknown>).endpointMapping
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const mapping: DatatruckEndpointMapping = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isDatatruckEndpointKey(key)) continue
    const path = normalizedPath(value)
    if (path) mapping[key] = path
  }
  return mapping
}

export function sanitizeDatatruckEndpointMapping(value: unknown): DatatruckEndpointMapping {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const mapping: DatatruckEndpointMapping = {}
  for (const [key, rawPath] of Object.entries(value)) {
    if (!isDatatruckEndpointKey(key)) continue
    const path = normalizedPath(rawPath)
    if (path) mapping[key] = path
  }
  return mapping
}

export function getDatatruckEndpointConfigs(metadata: unknown = null): DatatruckEndpointConfig[] {
  const mapping = parseDatatruckEndpointMapping(metadata)
  const confirmedKeys = Object.keys(DATATRUCK_ENDPOINTS) as Array<keyof typeof DATATRUCK_ENDPOINTS>
  const optionalKeys = Object.keys(DATATRUCK_OPTIONAL_ENDPOINTS) as Array<keyof typeof DATATRUCK_OPTIONAL_ENDPOINTS>
  return [...confirmedKeys, ...optionalKeys].map((key) => {
    const confirmed = Object.prototype.hasOwnProperty.call(DATATRUCK_ENDPOINTS, key)
    const defaultPath = confirmed ? DATATRUCK_ENDPOINTS[key as keyof typeof DATATRUCK_ENDPOINTS] : null
    const envVar = confirmed ? CONFIRMED_ENDPOINT_ENV_KEYS[key as keyof typeof DATATRUCK_ENDPOINTS] : DATATRUCK_OPTIONAL_ENDPOINTS[key as keyof typeof DATATRUCK_OPTIONAL_ENDPOINTS]
    const metadataPath = mapping[key]
    const envPath = normalizedPath(process.env[envVar])
    const path = metadataPath ?? envPath ?? defaultPath
    const configuredBy = metadataPath ? 'metadata' : envPath ? 'env' : defaultPath ? 'default' : 'not_mapped'
    return {
      key,
      label: DATATRUCK_ENDPOINT_LABELS[key],
      path,
      defaultPath,
      envVar,
      configuredBy,
      confirmed,
    }
  })
}

export function getConfiguredDatatruckEndpointConfigs(metadata: unknown = null): DatatruckEndpointConfig[] {
  return getDatatruckEndpointConfigs(metadata).filter((endpoint) => Boolean(endpoint.path))
}

export function getDatatruckFullAccountEndpointConfigs(): DatatruckEndpointConfig[] {
  return Object.entries(DATATRUCK_FULL_ACCOUNT_ENDPOINTS).map(([key, path]) => ({
    key: key as DatatruckEndpointKey,
    label: DATATRUCK_ENDPOINT_LABELS[key as DatatruckEndpointKey],
    path: path ?? null,
    defaultPath: path ?? null,
    envVar: null,
    configuredBy: 'default',
    confirmed: false,
  }))
}

export function datatruckEndpointPath(key: DatatruckEndpointKey, metadata: unknown = null): string | null {
  return getDatatruckEndpointConfigs(metadata).find((endpoint) => endpoint.key === key)?.path ?? null
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
    const list = Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.items)
          ? data.items
          : []
    const records = list.filter((record): record is DatatruckRecord => Boolean(record) && typeof record === 'object' && !Array.isArray(record))
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

export function buildDatatruckInternalBaseUrl(companyName: string): string {
  return `https://${companyName}.datatruck.io`
}

export function buildDatatruckUrl(connection: Pick<DatatruckConnection, 'apiBaseUrl'>, endpointOrUrl: string): string {
  return normalizeEndpointUrl(connection.apiBaseUrl, endpointOrUrl)
}

export function datatruckEndpointUrl(connection: Pick<DatatruckConnection, 'apiBaseUrl'>, key: DatatruckEndpointKey): string {
  const path = datatruckEndpointPath(key)
  if (!path) throw new Error(`Datatruck endpoint ${key} is not mapped`)
  return `${buildDatatruckUrl(connection, path)}${requiredQueryFor(key)}`
}

export function datatruckAuthHeaders(apiToken: string): Record<string, string> {
  return {
    Authorization: `Token ${apiToken}`,
    'Content-Type': 'application/json',
  }
}

export function datatruckInternalAuthHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
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
    endpoints: Object.fromEntries(getDatatruckEndpointConfigs().map((endpoint) => [endpoint.key, endpoint.path])),
    endpointMapping: {},
  }
}

export function safeDatatruckFullAccountMetadata(companyName: string) {
  return {
    mode: 'full_account',
    companyName,
    apiBaseUrlConfigured: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    authVersion: 1,
    endpoints: Object.fromEntries(Object.entries(DATATRUCK_FULL_ACCOUNT_ENDPOINTS)),
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

export async function datatruckInternalRequest(
  connection: DatatruckInternalConnection,
  endpointOrUrl: string,
  init: RequestInit = {},
  didRetry = false,
): Promise<Response> {
  const { getValidDatatruckInternalAccessToken } = await import('./auth')
  const accessToken = await getValidDatatruckInternalAccessToken(connection.workspaceId)
  const response = await fetch(buildDatatruckUrl({ apiBaseUrl: buildDatatruckInternalBaseUrl(connection.companyName) }, endpointOrUrl), {
    method: init.method ?? 'GET',
    ...init,
    headers: {
      ...datatruckInternalAuthHeaders(accessToken),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (response.status === 401 && !didRetry) {
    return datatruckInternalRequest(connection, endpointOrUrl, init, true)
  }
  return response
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
  let pagesFetched = 0
  let countFromApi: number | null = null
  let nextStoppedReason: DatatruckPaginatedFetchResult['nextStoppedReason'] = 'complete'
  const endpointPath = options.path ?? datatruckEndpointPath(endpointKey)
  if (!endpointPath) {
    return { endpointKey, records, pagesFetched, countFromApi, nextStoppedReason: 'complete', errors: ['Endpoint not mapped'] }
  }
  let nextUrl: string | null = `${buildDatatruckUrl(connection, endpointPath)}${requiredQueryFor(endpointKey)}`

  while (nextUrl && pagesFetched < maxPages && records.length < maxRecords) {
    const response = options.request ? await options.request(nextUrl) : await datatruckRequest(connection, nextUrl)
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
  pathOverride?: string,
): Promise<DatatruckEndpointResult> {
  const path = pathOverride ?? datatruckEndpointPath(key)
  if (!path) return { key, path: '', ok: true, status: null, records: 0 }
  const url = `${buildDatatruckUrl(connection, path)}${requiredQueryFor(key)}`
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
  const endpoints = await Promise.all(getConfiguredDatatruckEndpointConfigs().map((endpoint) => fetchDatatruckEndpoint(connection, endpoint.key, endpoint.path ?? undefined)))
  const failedEndpoints = endpoints.filter((endpoint) => !endpoint.ok).map((endpoint) => endpoint.key)
  return {
    ok: failedEndpoints.length === 0,
    fetched: endpoints.reduce((sum, endpoint) => sum + endpoint.records, 0),
    endpoints,
    failedEndpoints,
  }
}

export interface DatatruckShapeSummary {
  status: number
  topLevelKeys: string[]
  resultCount: number
  firstResultKeys: string[]
  nestedKeys: Record<string, string[]>
  paginated: boolean
  nextExists: boolean
}

export function summarizeDatatruckShape(status: number, payload: unknown): DatatruckShapeSummary {
  const topLevel = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
  const records = parseRecords(payload)
  const firstResult = records.records[0]
  const nestedKeys: Record<string, string[]> = {}
  if (firstResult) {
    for (const [key, value] of Object.entries(firstResult)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) nestedKeys[key] = Object.keys(value as Record<string, unknown>).slice(0, 30)
      else if (Array.isArray(value)) {
        const first = value.find((item) => item && typeof item === 'object' && !Array.isArray(item))
        nestedKeys[key] = first ? Object.keys(first as Record<string, unknown>).slice(0, 30) : []
      }
    }
  }
  return {
    status,
    topLevelKeys: topLevel ? Object.keys(topLevel).slice(0, 40) : [],
    resultCount: records.records.length,
    firstResultKeys: firstResult ? Object.keys(firstResult).slice(0, 60) : [],
    nestedKeys,
    paginated: Boolean(topLevel && ('next' in topLevel || 'count' in topLevel || 'results' in topLevel)),
    nextExists: Boolean(records.next),
  }
}
