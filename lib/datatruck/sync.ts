import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import {
  getDatatruckEndpointConfigs,
  getDatatruckFullAccountEndpointConfigs,
  datatruckInternalRequest,
  type DatatruckConnection,
  type DatatruckInternalConnection,
  type DatatruckEndpointConfig,
  type DatatruckEndpointKey,
  fetchDatatruckPaginated,
} from './client'
import {
  genericDatatruckRecordNormalizer,
  normalizeDatatruckDriver,
  normalizeDatatruckLoad,
  normalizeDatatruckTrailer,
  normalizeDatatruckTruck,
  normalizeDatatruckWorkOrder,
  normalizeDispatcherBoardItem,
  type DatatruckEntityKind,
  type DatatruckNormalizedDocument,
  type DatatruckNormalizedItem,
} from './normalize'

type DatatruckRecord = Record<string, unknown>

const ENDPOINT_KIND: Record<DatatruckEndpointKey, DatatruckEntityKind> = {
  loads: 'load',
  dispatcherBoard: 'dispatcher_board',
  drivers: 'driver',
  trucks: 'truck',
  trailers: 'trailer',
  workOrders: 'work_order',
  liveLoads: 'generic',
  myLoads: 'generic',
  ltlTrips: 'generic',
  loadboard: 'generic',
  planningBoard: 'generic',
  invoices: 'generic',
  bills: 'generic',
  payroll: 'generic',
  dispatchers: 'generic',
  vendors: 'generic',
  charges: 'generic',
  transactions: 'generic',
  customers: 'generic',
  safetyTasks: 'generic',
  compliance: 'generic',
  inspections: 'generic',
  fleetBoard: 'generic',
  inventory: 'generic',
  fleetIssues: 'generic',
  users: 'generic',
  reports: 'generic',
  fuel: 'generic',
  toll: 'generic',
  moneyCode: 'generic',
  cashAdvance: 'generic',
  scale: 'generic',
  mailbox: 'generic',
}

const MAX_LOAD_SUMMARY_CHARS = 8_000

export interface DatatruckLoadTotals {
  count: number
  pay: number
  byStatus: Record<string, { count: number; pay: number }>
}

export interface DatatruckEndpointSummary {
  endpointKey: DatatruckEndpointKey
  label: string
  path: string
  configuredBy: 'metadata' | 'env' | 'default' | 'not_mapped'
  status: 'synced' | 'failed' | 'not_mapped'
  fetched: number
  created: number
  updated: number
  skipped: number
  pagesFetched: number
  countFromApi: number | null
  nextStoppedReason: 'complete' | 'max_pages' | 'max_records' | 'error'
  error: string | null
}

export interface DatatruckSyncResult {
  ok: boolean
  fetched: number
  created: number
  updated: number
  skipped: number
  embeddingErrors: number
  failedEndpoints: DatatruckEndpointKey[]
  endpoints: Record<DatatruckEndpointKey, DatatruckEndpointSummary>
  totalFetched: number
  totalCreated: number
  totalUpdated: number
  totalSkipped: number
  warnings: string[]
  hasMore: boolean
  loadTotals: DatatruckLoadTotals
  message: string
}

function isPlainObject(value: unknown): value is DatatruckRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function contentHash(sourceExternalId: string, content: string): string {
  return `datatruck:${crypto.createHash('sha256').update(`${sourceExternalId}\n${content}`).digest('hex')}`
}

function addLoadToTotals(totals: DatatruckLoadTotals, record: DatatruckRecord): void {
  const status = typeof record.status === 'string' && record.status.trim() ? record.status.trim() : 'unknown'
  const payCandidates = ['load_pay', 'total_pay', 'pay', 'gross_pay', 'rate', 'price']
  let pay = 0
  for (const key of payCandidates) {
    const raw = record[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      pay = raw
      break
    }
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number.parseFloat(raw)
      if (Number.isFinite(parsed)) {
        pay = parsed
        break
      }
    }
  }
  totals.count += 1
  totals.pay += pay
  const bucket = totals.byStatus[status] ?? { count: 0, pay: 0 }
  totals.byStatus[status] = { count: bucket.count + 1, pay: bucket.pay + pay }
}

function emptyLoadTotals(): DatatruckLoadTotals {
  return { count: 0, pay: 0, byStatus: {} }
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function loadSummaryContent(totals: DatatruckLoadTotals): string {
  const byStatus = Object.entries(totals.byStatus)
    .sort(([, a], [, b]) => b.pay - a.pay)
    .map(([status, bucket]) => `${status.replace(/_/g, ' ')}: ${bucket.count} loads totaling ${formatMoney(bucket.pay)}`)
    .join('; ')
  return `Datatruck loads summary — total gross across all ${totals.count} loads: ${formatMoney(totals.pay)}.${byStatus ? ` By status — ${byStatus}.` : ''}`
}

function summaryCategory(item: DatatruckNormalizedItem): string {
  if (item.kind === 'load') {
    const summaryType = typeof item.sourceMetadata.summaryType === 'string' ? item.sourceMetadata.summaryType : ''
    return summaryType === 'documents' ? 'reference' : 'status_update'
  }
  if (item.kind === 'dispatcher_board') return 'status_update'
  return 'reference'
}

function stableSourceMetadata(item: DatatruckNormalizedItem, endpointKey: DatatruckEndpointKey): Record<string, unknown> {
  return {
    ...item.sourceMetadata,
    endpointKey,
    entityKind: item.kind,
    title: item.title,
  }
}

function limitText(content: string): string {
  return content.length <= MAX_LOAD_SUMMARY_CHARS ? content : `${content.slice(0, MAX_LOAD_SUMMARY_CHARS)}…`
}

export async function upsertKnowledgeItem(params: {
  workspaceId: string
  endpointKey: DatatruckEndpointKey
  item: DatatruckNormalizedItem
  counters: { created: number; updated: number; skipped: number; embeddingErrors: number }
}): Promise<void> {
  const { workspaceId, endpointKey, item, counters } = params
  const externalId = item.externalId
  const content = limitText(item.content)
  const hash = contentHash(externalId, content)
  const category = summaryCategory(item)
  const sourceMetadata = stableSourceMetadata(item, endpointKey)

  const existing = await prisma.knowledgeItem.findFirst({
    where: { workspaceId, source: 'datatruck', sourceExternalId: externalId },
    select: { id: true, contentHash: true, typeOverriddenByUser: true },
  })

  if (existing) {
    if (existing.contentHash === hash) {
      counters.skipped++
      return
    }

    await prisma.knowledgeItem.update({
      where: { id: existing.id },
      data: {
        content,
        contentHash: hash,
        sourceMetadata: sourceMetadata as Prisma.InputJsonValue,
        sourceUrl: item.sourceUrl,
        owner: item.owner,
        sourceCreatedAt: item.sourceCreatedAt,
        ...(existing.typeOverriddenByUser ? {} : { category }),
      },
    })
    counters.updated++
    return
  }

  const created = await prisma.knowledgeItem.create({
    data: {
      workspaceId,
      content,
      contentHash: hash,
      category,
      aiSuggestedCategory: category,
      source: 'datatruck',
      sourceExternalId: externalId,
      sourceMetadata: sourceMetadata as Prisma.InputJsonValue,
      sourceUrl: item.sourceUrl,
      owner: item.owner,
      sourceCreatedAt: item.sourceCreatedAt,
      visibility: 'team',
      confidence: 0.9,
    },
    select: { id: true },
  })
  counters.created++

  try {
    const embedding = await generateEmbedding(content)
    await upsertEmbedding(created.id, embedding, { workspaceId, category, source: 'datatruck' })
    await prisma.knowledgeItem.update({ where: { id: created.id }, data: { embeddingId: created.id } })
  } catch {
    counters.embeddingErrors++
  }
}

function documentSignature(document: DatatruckNormalizedDocument): string {
  return [
    document.externalId,
    document.documentType,
    document.fileName,
    document.sourceUrl ?? '',
    document.storageUrl ?? '',
    document.storageKey ?? '',
    document.mimeType ?? '',
    document.fileSize ?? '',
    document.extractionStatus ?? '',
    document.externalLoadId ?? '',
    document.sourceMessageId ?? '',
  ].join('|')
}

async function upsertDocumentAttachment(
  workspaceId: string,
  document: DatatruckNormalizedDocument,
  counters: { created: number; updated: number; skipped: number },
): Promise<string> {
  const existing = await prisma.documentAttachment.findFirst({
    where: { workspaceId, source: 'datatruck', sourceExternalId: document.externalId },
    select: { id: true, fileName: true, sourceUrl: true, storageUrl: true, storageKey: true, mimeType: true, fileSize: true, extractionStatus: true, externalLoadId: true, documentType: true },
  })
  const nextData = {
    externalLoadId: document.externalLoadId,
    documentType: document.documentType,
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    source: 'datatruck',
    sourceExternalId: document.externalId,
    sourceUrl: document.sourceUrl,
    storageUrl: document.storageUrl,
    storageKey: document.storageKey,
    extractionStatus: document.extractionStatus,
  }

  if (existing) {
    const currentSignature = [
      document.externalId,
      existing.documentType ?? '',
      existing.fileName,
      existing.sourceUrl ?? '',
      existing.storageUrl ?? '',
      existing.storageKey ?? '',
      existing.mimeType ?? '',
      existing.fileSize ?? '',
      existing.extractionStatus ?? '',
      existing.externalLoadId ?? '',
    ].join('|')
    if (documentSignature(document) === currentSignature) {
      counters.skipped++
      return existing.id
    }
    await prisma.documentAttachment.update({ where: { id: existing.id }, data: nextData })
    counters.updated++
    return existing.id
  }

  const created = await prisma.documentAttachment.create({
    data: { workspaceId, ...nextData },
    select: { id: true },
  })
  counters.created++
  return created.id
}

function loadTotalsFromRecords(records: DatatruckRecord[]): DatatruckLoadTotals {
  const totals = emptyLoadTotals()
  for (const record of records) addLoadToTotals(totals, record)
  return totals
}

function normalizeRecord(kind: DatatruckEntityKind, record: DatatruckRecord): DatatruckNormalizedItem[] {
  if (kind === 'load') return normalizeDatatruckLoad(record)
  if (kind === 'dispatcher_board') return [normalizeDispatcherBoardItem(record)]
  if (kind === 'driver') return [normalizeDatatruckDriver(record)]
  if (kind === 'truck') return [normalizeDatatruckTruck(record)]
  if (kind === 'trailer') return [normalizeDatatruckTrailer(record)]
  if (kind === 'generic') return [genericDatatruckRecordNormalizer('record', record)]
  return [normalizeDatatruckWorkOrder(record)]
}

function normalizeEndpointRecord(endpointKey: DatatruckEndpointKey, record: DatatruckRecord): DatatruckNormalizedItem[] {
  const kind = ENDPOINT_KIND[endpointKey]
  if (kind === 'generic') return [genericDatatruckRecordNormalizer(endpointKey, record)]
  return normalizeRecord(kind, record)
}

function summarizeEndpoint(
  endpoint: DatatruckEndpointConfig,
  fetched: number,
  created: number,
  updated: number,
  skipped: number,
  pagesFetched: number,
  countFromApi: number | null,
  nextStoppedReason: DatatruckEndpointSummary['nextStoppedReason'],
  error: string | null,
): DatatruckEndpointSummary {
  return {
    endpointKey: endpoint.key,
    label: endpoint.label,
    path: endpoint.path ?? '',
    configuredBy: endpoint.configuredBy,
    status: endpoint.path ? (error ? 'failed' : 'synced') : 'not_mapped',
    fetched,
    created,
    updated,
    skipped,
    pagesFetched,
    countFromApi,
    nextStoppedReason,
    error,
  }
}

export async function syncDatatruckKnowledge(
  workspaceId: string,
  connection: DatatruckConnection,
  _previousCursors: Record<string, string | null> = {},
  _previousLoadTotals?: DatatruckLoadTotals,
  metadata: unknown = null,
): Promise<DatatruckSyncResult> {
  const counters = { created: 0, updated: 0, skipped: 0, embeddingErrors: 0 }
  const failedEndpoints: DatatruckEndpointKey[] = []
  const warnings: string[] = []
  const endpointSummaries = {} as Record<DatatruckEndpointKey, DatatruckEndpointSummary>
  const loadTotals = emptyLoadTotals()
  let totalFetched = 0
  let hasMore = false

  for (const endpoint of getDatatruckEndpointConfigs(metadata)) {
    const endpointKey = endpoint.key
    if (!endpoint.path) {
      endpointSummaries[endpointKey] = summarizeEndpoint(endpoint, 0, 0, 0, 0, 0, null, 'complete', null)
      continue
    }

    const result = await fetchDatatruckPaginated(connection, endpointKey, { path: endpoint.path })
    const endpointCounters = { created: 0, updated: 0, skipped: 0, embeddingErrors: 0 }
    let endpointError: string | null = null
    let endpointFetched = 0

    try {
      const records = result.records
      endpointFetched = records.length
      totalFetched += endpointFetched

      if (endpointKey === 'loads') {
        const partialTotals = loadTotalsFromRecords(records)
        loadTotals.count += partialTotals.count
        loadTotals.pay += partialTotals.pay
        for (const [status, bucket] of Object.entries(partialTotals.byStatus)) {
          const existing = loadTotals.byStatus[status] ?? { count: 0, pay: 0 }
          loadTotals.byStatus[status] = {
            count: existing.count + bucket.count,
            pay: existing.pay + bucket.pay,
          }
        }
      }

      for (const record of records) {
        const normalizedItems = normalizeEndpointRecord(endpointKey, record)
        const documentsByExternalId = new Map<string, DatatruckNormalizedDocument>()
        for (const item of normalizedItems) {
          for (const document of item.documents) {
            documentsByExternalId.set(document.externalId, document)
          }
        }
        const documentIdsByExternalId = new Map<string, string>()
        for (const document of documentsByExternalId.values()) {
          const documentId = await upsertDocumentAttachment(workspaceId, document, endpointCounters)
          documentIdsByExternalId.set(document.externalId, documentId)
        }
        const documentIds = [...documentIdsByExternalId.values()]
        for (const item of normalizedItems) {
          const itemDocumentIds = item.documents
            .map((document) => documentIdsByExternalId.get(document.externalId))
            .filter((documentId): documentId is string => Boolean(documentId))
          const relatedDocumentIds = item.kind === 'load' && item.relatedLoadId && documentIds.length > 0
            ? documentIds
            : itemDocumentIds
          const itemWithDocumentLinks: DatatruckNormalizedItem = relatedDocumentIds.length > 0
            ? {
                ...item,
                sourceMetadata: {
                  ...item.sourceMetadata,
                  hasAttachment: true,
                  documentIds: relatedDocumentIds,
                  ...(itemDocumentIds.length === 1 ? { documentId: itemDocumentIds[0] } : {}),
                },
              }
            : item
          await upsertKnowledgeItem({ workspaceId, endpointKey, item: itemWithDocumentLinks, counters: endpointCounters })
        }
      }

      if (endpointKey === 'loads' && result.nextStoppedReason === 'complete' && endpointFetched > 0) {
        const summaryContent = loadSummaryContent(loadTotals)
        const summaryItem: DatatruckNormalizedItem = {
          externalId: 'datatruck:loads:summary',
          kind: 'load',
          title: 'Datatruck load summary',
          content: summaryContent,
          sourceMetadata: { recordType: 'load', summaryType: 'load_summary', loadCount: loadTotals.count, totalPay: loadTotals.pay },
          sourceUrl: null,
          owner: null,
          sourceCreatedAt: null,
          relatedLoadId: null,
          documents: [],
        }
        await upsertKnowledgeItem({ workspaceId, endpointKey, item: summaryItem, counters: endpointCounters })
      }

      if (result.nextStoppedReason === 'max_pages' || result.nextStoppedReason === 'max_records') {
        hasMore = true
        warnings.push(`Datatruck ${endpointKey} stopped after ${result.pagesFetched} page(s).`)
      }
      if (result.errors.length > 0) {
        endpointError = result.errors.join('; ')
        warnings.push(`Datatruck ${endpointKey} returned a pagination error.`)
      }
    } catch (error) {
      endpointError = error instanceof Error ? error.message : 'unknown error'
      warnings.push(`Datatruck ${endpointKey} failed.`)
      console.error('[datatruck/sync] endpoint failed', { endpointKey, message: endpointError })
    }

    if (endpointError) failedEndpoints.push(endpointKey)

    endpointSummaries[endpointKey] = summarizeEndpoint(
      endpoint,
      endpointFetched,
      endpointCounters.created,
      endpointCounters.updated,
      endpointCounters.skipped,
      result.pagesFetched,
      result.countFromApi,
      result.nextStoppedReason,
      endpointError,
    )

    counters.created += endpointCounters.created
    counters.updated += endpointCounters.updated
    counters.skipped += endpointCounters.skipped
    counters.embeddingErrors += endpointCounters.embeddingErrors
  }

  const ok = failedEndpoints.length === 0
  return {
    ok,
    fetched: totalFetched,
    created: counters.created,
    updated: counters.updated,
    skipped: counters.skipped,
    embeddingErrors: counters.embeddingErrors,
    failedEndpoints,
    endpoints: endpointSummaries,
    totalFetched,
    totalCreated: counters.created,
    totalUpdated: counters.updated,
    totalSkipped: counters.skipped,
    warnings,
    hasMore,
    loadTotals,
    message: ok
      ? 'Datatruck sync complete.'
      : 'Datatruck sync completed with some warnings.',
  }
}

async function syncDatatruckEndpointSet(
  workspaceId: string,
  baseConnection: DatatruckConnection,
  endpoints: DatatruckEndpointConfig[],
  request?: (endpointOrUrl: string) => Promise<Response>,
): Promise<DatatruckSyncResult> {
  const counters = { created: 0, updated: 0, skipped: 0, embeddingErrors: 0 }
  const failedEndpoints: DatatruckEndpointKey[] = []
  const warnings: string[] = []
  const endpointSummaries = {} as Record<DatatruckEndpointKey, DatatruckEndpointSummary>
  const loadTotals = emptyLoadTotals()
  let totalFetched = 0
  let hasMore = false

  for (const endpoint of endpoints) {
    const endpointKey = endpoint.key
    if (!endpoint.path) {
      endpointSummaries[endpointKey] = summarizeEndpoint(endpoint, 0, 0, 0, 0, 0, null, 'complete', null)
      continue
    }

    const result = await fetchDatatruckPaginated(baseConnection, endpointKey, { path: endpoint.path, request })
    const endpointCounters = { created: 0, updated: 0, skipped: 0, embeddingErrors: 0 }
    let endpointError: string | null = null
    let endpointFetched = 0

    try {
      const records = result.records
      endpointFetched = records.length
      totalFetched += endpointFetched

      if (endpointKey === 'loads') {
        const partialTotals = loadTotalsFromRecords(records)
        loadTotals.count += partialTotals.count
        loadTotals.pay += partialTotals.pay
        for (const [status, bucket] of Object.entries(partialTotals.byStatus)) {
          const existing = loadTotals.byStatus[status] ?? { count: 0, pay: 0 }
          loadTotals.byStatus[status] = {
            count: existing.count + bucket.count,
            pay: existing.pay + bucket.pay,
          }
        }
      }

      for (const record of records) {
        const normalizedItems = normalizeEndpointRecord(endpointKey, record)
        const documentsByExternalId = new Map<string, DatatruckNormalizedDocument>()
        for (const item of normalizedItems) {
          for (const document of item.documents) documentsByExternalId.set(document.externalId, document)
        }
        const documentIdsByExternalId = new Map<string, string>()
        for (const document of documentsByExternalId.values()) {
          const documentId = await upsertDocumentAttachment(workspaceId, document, endpointCounters)
          documentIdsByExternalId.set(document.externalId, documentId)
        }
        const documentIds = [...documentIdsByExternalId.values()]
        for (const item of normalizedItems) {
          const itemDocumentIds = item.documents
            .map((document) => documentIdsByExternalId.get(document.externalId))
            .filter((documentId): documentId is string => Boolean(documentId))
          const relatedDocumentIds = item.kind === 'load' && item.relatedLoadId && documentIds.length > 0
            ? documentIds
            : itemDocumentIds
          const itemWithDocumentLinks: DatatruckNormalizedItem = relatedDocumentIds.length > 0
            ? {
                ...item,
                sourceMetadata: {
                  ...item.sourceMetadata,
                  hasAttachment: true,
                  documentIds: relatedDocumentIds,
                  ...(itemDocumentIds.length === 1 ? { documentId: itemDocumentIds[0] } : {}),
                },
              }
            : item
          await upsertKnowledgeItem({ workspaceId, endpointKey, item: itemWithDocumentLinks, counters: endpointCounters })
        }
      }

      if (endpointKey === 'loads' && result.nextStoppedReason === 'complete' && endpointFetched > 0) {
        const summaryItem: DatatruckNormalizedItem = {
          externalId: 'datatruck:loads:summary',
          kind: 'load',
          title: 'Datatruck load summary',
          content: loadSummaryContent(loadTotals),
          sourceMetadata: { recordType: 'load', summaryType: 'load_summary', loadCount: loadTotals.count, totalPay: loadTotals.pay },
          sourceUrl: null,
          owner: null,
          sourceCreatedAt: null,
          relatedLoadId: null,
          documents: [],
        }
        await upsertKnowledgeItem({ workspaceId, endpointKey, item: summaryItem, counters: endpointCounters })
      }

      if (result.nextStoppedReason === 'max_pages' || result.nextStoppedReason === 'max_records') {
        hasMore = true
        warnings.push(`Datatruck ${endpointKey} stopped after ${result.pagesFetched} page(s).`)
      }
      if (result.errors.length > 0) {
        endpointError = result.errors.join('; ')
        warnings.push(`Datatruck ${endpointKey} returned a pagination error.`)
      }
    } catch (error) {
      endpointError = error instanceof Error ? error.message : 'unknown error'
      warnings.push(`Datatruck ${endpointKey} failed.`)
      console.error('[datatruck/sync] endpoint failed', { endpointKey, message: endpointError })
    }

    if (endpointError) failedEndpoints.push(endpointKey)
    endpointSummaries[endpointKey] = summarizeEndpoint(
      endpoint,
      endpointFetched,
      endpointCounters.created,
      endpointCounters.updated,
      endpointCounters.skipped,
      result.pagesFetched,
      result.countFromApi,
      result.nextStoppedReason,
      endpointError,
    )
    counters.created += endpointCounters.created
    counters.updated += endpointCounters.updated
    counters.skipped += endpointCounters.skipped
    counters.embeddingErrors += endpointCounters.embeddingErrors
  }

  const ok = failedEndpoints.length === 0
  return {
    ok,
    fetched: totalFetched,
    created: counters.created,
    updated: counters.updated,
    skipped: counters.skipped,
    embeddingErrors: counters.embeddingErrors,
    failedEndpoints,
    endpoints: endpointSummaries,
    totalFetched,
    totalCreated: counters.created,
    totalUpdated: counters.updated,
    totalSkipped: counters.skipped,
    warnings,
    hasMore,
    loadTotals,
    message: ok ? 'Datatruck sync complete.' : 'Datatruck sync completed with some warnings.',
  }
}

export async function syncDatatruckFullAccountKnowledge(
  workspaceId: string,
  connection: DatatruckInternalConnection,
): Promise<DatatruckSyncResult> {
  return syncDatatruckEndpointSet(
    workspaceId,
    { apiBaseUrl: `https://${connection.companyName}.datatruck.io`, apiToken: '' },
    getDatatruckFullAccountEndpointConfigs(),
    (endpointOrUrl) => datatruckInternalRequest(connection, endpointOrUrl),
  )
}

export {
  normalizeDatatruckDriver,
  normalizeDatatruckLoad,
  normalizeDatatruckTrailer,
  normalizeDatatruckTruck,
  normalizeDatatruckWorkOrder,
  normalizeDispatcherBoardItem,
  genericDatatruckRecordNormalizer,
}
