type DatatruckRecord = Record<string, unknown>

export type DatatruckEntityKind =
  | 'load'
  | 'dispatcher_board'
  | 'driver'
  | 'truck'
  | 'trailer'
  | 'work_order'

export interface DatatruckNormalizedDocument {
  externalId: string
  documentType: string
  fileName: string
  sourceUrl: string | null
  storageUrl: string | null
  storageKey: string | null
  mimeType: string | null
  fileSize: number | null
  extractionStatus: 'pending' | 'unsupported' | 'extracted'
  externalLoadId: string | null
  sourceMessageId: string | null
  sourceExternalId: string
}

export interface DatatruckNormalizedItem {
  externalId: string
  kind: DatatruckEntityKind
  title: string
  content: string
  sourceMetadata: Record<string, unknown>
  sourceUrl: string | null
  owner: string | null
  sourceCreatedAt: Date | null
  relatedLoadId: string | null
  documents: DatatruckNormalizedDocument[]
}

function isPlainObject(value: unknown): value is DatatruckRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function firstText(record: DatatruckRecord, keys: string[]): string | null {
  for (const key of keys) {
    const direct = asText(record[key])
    if (direct) return direct
    const snake = asText(record[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)])
    if (snake) return snake
  }
  return null
}

function firstNumber(record: DatatruckRecord, keys: string[]): number | null {
  for (const key of keys) {
    const raw = record[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function firstDate(record: DatatruckRecord, keys: string[]): Date | null {
  for (const key of keys) {
    const raw = record[key]
    const value = typeof raw === 'string' ? new Date(raw) : raw instanceof Date ? raw : null
    if (value && !Number.isNaN(value.getTime())) return value
  }
  return null
}

function nestedText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (!isPlainObject(value)) return null
  for (const key of [
    'load_number',
    'loadNumber',
    'reference_number',
    'referenceNumber',
    'number',
    'unit_number',
    'unitNumber',
    'name',
    'full_name',
    'fullName',
    'display_name',
    'displayName',
    'plate_number',
    'plateNumber',
    'vin',
    'id',
  ]) {
    const text = asText(value[key])
    if (text) return text
  }
  return null
}

function nestedArray(record: DatatruckRecord, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function titleFromKind(kind: DatatruckEntityKind): string {
  if (kind === 'dispatcher_board') return 'Dispatcher board'
  if (kind === 'work_order') return 'Work order'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function omitEmptyFields(entries: Array<[string, unknown]>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    if (Array.isArray(value) && value.length === 0) continue
    next[key] = value
  }
  return next
}

function addIfValue(lines: string[], label: string, value: string | null | undefined) {
  if (value) lines.push(`${label}: ${value}`)
}

function addIfNumber(lines: string[], label: string, value: number | null | undefined) {
  if (value === null || value === undefined) return
  lines.push(`${label}: ${value}`)
}

function dateText(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function summarizeStops(record: DatatruckRecord): string[] {
  const stops = nestedArray(record, ['stops', 'stop_list', 'route_stops', 'load_stops'])
  if (stops.length === 0) return []

  return stops.slice(0, 10).map((stop, index) => {
    if (!isPlainObject(stop)) return `Stop ${index + 1}`
    const stopType = firstText(stop, ['type', 'stop_type', 'kind']) ?? `Stop ${index + 1}`
    const location = nestedText(stop.location) ?? firstText(stop, ['location', 'address', 'city', 'state'])
    const windowStart = firstText(stop, ['window_start', 'pickup_window_start', 'arrival_start', 'eta_start'])
    const windowEnd = firstText(stop, ['window_end', 'pickup_window_end', 'arrival_end', 'eta_end'])
    const parts = [location, windowStart && windowEnd ? `${windowStart} - ${windowEnd}` : windowStart ?? windowEnd].filter(Boolean)
    return `${stopType}${parts.length ? `: ${parts.join(' · ')}` : ''}`
  })
}

function summarizeDocuments(
  record: DatatruckRecord,
  fallbackLoadId: string | null,
): { content: string | null; documents: DatatruckNormalizedDocument[] } {
  const rawDocuments = [
    ...nestedArray(record, ['documents', 'files', 'attachments']),
    ...(isPlainObject(record.bol) ? [record.bol] : []),
    ...(isPlainObject(record.pod) ? [record.pod] : []),
    ...(isPlainObject(record.rate_confirmation) ? [record.rate_confirmation] : []),
    ...(isPlainObject(record.rateConfirmation) ? [record.rateConfirmation] : []),
    ...(isPlainObject(record.invoice) ? [record.invoice] : []),
  ]

  const documents: DatatruckNormalizedDocument[] = []
  for (const [index, raw] of rawDocuments.entries()) {
    const document = isPlainObject(raw) ? raw : { value: raw }
    const fileName = firstText(document, ['file_name', 'filename', 'name', 'title']) ?? `Document ${index + 1}`
    const documentType = firstText(document, ['document_type', 'type', 'kind', 'doc_type']) ?? 'OTHER'
    const sourceUrl = firstText(document, ['document_url', 'file_url', 'url', 'source_url'])
    const storageUrl = firstText(document, ['storage_url', 'download_url'])
    const storageKey = firstText(document, ['storage_key', 'key'])
    const mimeType = firstText(document, ['mime_type', 'content_type'])
    const fileSize = firstNumber(document, ['file_size', 'size'])
    const externalLoadId = firstText(document, ['load_id', 'external_load_id', 'order_id', 'order_number', 'load_number']) ?? fallbackLoadId
    const sourceMessageId = firstText(document, ['message_id', 'source_message_id'])
    const extractionStatus: DatatruckNormalizedDocument['extractionStatus'] = storageUrl || sourceUrl
      ? 'pending'
      : 'unsupported'
    const externalId = firstText(document, ['id', 'uuid']) ?? `${documentType}:${index + 1}:${fileName}`
    documents.push({
      externalId,
      documentType,
      fileName,
      sourceUrl,
      storageUrl,
      storageKey,
      mimeType,
      fileSize,
      extractionStatus,
      externalLoadId,
      sourceMessageId,
      sourceExternalId: externalId,
    })
  }

  if (documents.length === 0) return { content: null, documents: [] }
  const lines = ['Documents:']
  for (const document of documents) {
    const parts = [
      `${document.documentType}`,
      document.fileName,
      document.externalLoadId ? `Load ${document.externalLoadId}` : null,
      document.sourceUrl ? 'source link available' : null,
      document.storageUrl ? 'download link available' : null,
    ].filter(Boolean)
    lines.push(`- ${parts.join(' · ')}`)
  }
  return { content: lines.join('\n'), documents }
}

function commonLoadMetadata(record: DatatruckRecord, kind: DatatruckEntityKind) {
  const loadId = firstText(record, ['id', 'load_id', 'loadId', 'order_id', 'orderId', 'reference_number', 'referenceNumber'])
  const loadNumber = firstText(record, ['load_number', 'loadNumber', 'order_number', 'orderNumber'])
  const status = firstText(record, ['status', 'load_status', 'dispatch_status'])
  const customer = firstText(record, ['customer', 'customer_name', 'shipper', 'broker', 'carrier'])
  const driver = nestedText(record.driver) ?? nestedText(record.assigned_driver) ?? firstText(record, ['driver', 'driver_name'])
  const truck = nestedText(record.truck) ?? nestedText(record.assigned_truck) ?? firstText(record, ['truck', 'truck_number'])
  const trailer = nestedText(record.trailer) ?? nestedText(record.assigned_trailer) ?? firstText(record, ['trailer', 'trailer_number'])
  const origin = firstText(record, ['origin', 'pickup', 'pickup_location', 'pickup_address', 'origin_location'])
  const destination = firstText(record, ['destination', 'delivery', 'delivery_location', 'delivery_address', 'destination_location'])
  const pickupAt = firstText(record, ['pickup_at', 'pickup_time', 'pickup_datetime', 'pickupDateTime'])
  const deliveryAt = firstText(record, ['delivery_at', 'delivery_time', 'delivery_datetime', 'deliveryDateTime'])
  const eta = firstText(record, ['eta', 'estimated_arrival', 'estimated_arrival_time', 'estimated_delivery'])
  const rate = firstText(record, ['rate', 'gross_pay', 'load_pay', 'total_pay', 'price'])
  const miles = firstNumber(record, ['miles', 'distance'])
  const tags = nestedArray(record, ['tags', 'labels']).map((tag) => asText(tag)).filter((tag): tag is string => Boolean(tag))
  const notes = firstText(record, ['notes', 'note', 'comments', 'dispatcher_notes', 'dispatch_notes'])
  const dispatcher = firstText(record, ['dispatcher', 'dispatcher_name', 'assigned_dispatcher'])
  const createdAt = dateText(firstDate(record, ['created_at', 'createdAt', 'created_date']))
  const updatedAt = dateText(firstDate(record, ['updated_at', 'updatedAt', 'modified_at']))
  const docs = summarizeDocuments(record, loadId)
  const stops = summarizeStops(record)
  const summaryMetadata = omitEmptyFields([
    ['recordType', kind],
    ['loadId', loadId],
    ['loadNumber', loadNumber],
    ['status', status],
    ['customer', customer],
    ['driver', driver],
    ['truck', truck],
    ['trailer', trailer],
    ['origin', origin],
    ['destination', destination],
    ['pickupAt', pickupAt],
    ['deliveryAt', deliveryAt],
    ['eta', eta],
    ['rate', rate],
    ['miles', miles],
    ['tags', tags],
    ['notes', notes],
    ['dispatcher', dispatcher],
    ['createdAt', createdAt],
    ['updatedAt', updatedAt],
    ['documentsCount', docs.documents.length],
    ['stopsCount', stops.length],
  ])

  return { kind, loadId, loadNumber, status, customer, driver, truck, trailer, origin, destination, pickupAt, deliveryAt, eta, rate, miles, tags, notes, dispatcher, createdAt, updatedAt, docs, stops, summaryMetadata }
}

function buildSummaryLines({
  kind,
  loadId,
  loadNumber,
  status,
  customer,
  driver,
  truck,
  trailer,
  origin,
  destination,
  pickupAt,
  deliveryAt,
  eta,
  rate,
  miles,
  tags,
  notes,
  dispatcher,
  createdAt,
  updatedAt,
}: ReturnType<typeof commonLoadMetadata>) {
  const lines = [`Datatruck ${titleFromKind(kind)} summary`]
  addIfValue(lines, 'ID', loadId)
  addIfValue(lines, 'Load', loadNumber)
  addIfValue(lines, 'Status', status)
  addIfValue(lines, 'Customer', customer)
  addIfValue(lines, 'Driver', driver)
  addIfValue(lines, 'Truck', truck)
  addIfValue(lines, 'Trailer', trailer)
  addIfValue(lines, 'Origin', origin)
  addIfValue(lines, 'Destination', destination)
  addIfValue(lines, 'Pickup', pickupAt)
  addIfValue(lines, 'Delivery', deliveryAt)
  addIfValue(lines, 'ETA', eta)
  addIfValue(lines, 'Rate', rate)
  addIfNumber(lines, 'Miles', miles)
  if (tags.length > 0) addIfValue(lines, 'Tags', tags.join(', '))
  addIfValue(lines, 'Notes', notes)
  addIfValue(lines, 'Dispatcher', dispatcher)
  addIfValue(lines, 'Created', createdAt)
  addIfValue(lines, 'Updated', updatedAt)
  return lines.join('\n')
}

function recordId(record: DatatruckRecord): string {
  return firstText(record, ['id', 'uuid', 'load_id', 'loadId', 'order_id', 'orderId', 'work_order_id', 'workOrderId']) ?? 'unknown'
}

function loadExternalId(record: DatatruckRecord): string {
  return firstText(record, ['id', 'uuid', 'load_id', 'loadId', 'order_id', 'orderId']) ?? recordId(record)
}

export function normalizeDatatruckLoad(record: DatatruckRecord): DatatruckNormalizedItem[] {
  const meta = commonLoadMetadata(record, 'load')
  const summary = buildSummaryLines(meta)
  const loadId = meta.loadId ?? loadExternalId(record)
  const items: DatatruckNormalizedItem[] = [{
    externalId: `datatruck:load:${loadId}:summary`,
    kind: 'load',
    title: `Load ${meta.loadNumber ?? loadId}`,
    content: summary,
    sourceMetadata: omitEmptyFields([
      ...Object.entries(meta.summaryMetadata),
      ['loadNumber', meta.loadNumber],
      ['summaryType', 'load'],
    ]),
    sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl', 'load_url']) ?? null,
    owner: meta.dispatcher ?? meta.customer ?? null,
    sourceCreatedAt: firstDate(record, ['created_at', 'createdAt', 'created_date']),
    relatedLoadId: loadId,
    documents: [],
  }]
  if (meta.stops.length > 0) {
    items.push({
      externalId: `datatruck:load:${loadId}:stops`,
      kind: 'load',
      title: `Load ${meta.loadNumber ?? loadId} stops`,
      content: [
        `Datatruck load stops for ${meta.loadNumber ?? loadId}`,
        ...meta.stops.map((stop, index) => `${index + 1}. ${stop}`),
      ].join('\n'),
      sourceMetadata: omitEmptyFields([
        ...Object.entries(meta.summaryMetadata),
        ['summaryType', 'stops'],
        ['stops', meta.stops],
      ]),
      sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl', 'load_url']) ?? null,
      owner: meta.dispatcher ?? meta.customer ?? null,
      sourceCreatedAt: firstDate(record, ['created_at', 'createdAt', 'created_date']),
      relatedLoadId: loadId,
      documents: [],
    })
  }
  if (meta.docs.content && meta.docs.documents.length > 0) {
    items.push({
      externalId: `datatruck:load:${loadId}:documents`,
      kind: 'load',
      title: `Load ${meta.loadNumber ?? loadId} documents`,
      content: [
        `Datatruck load documents for ${meta.loadNumber ?? loadId}`,
        meta.docs.content,
      ].join('\n'),
      sourceMetadata: omitEmptyFields([
        ...Object.entries(meta.summaryMetadata),
        ['summaryType', 'documents'],
        ['documents', meta.docs.documents.map((document) => omitEmptyFields([
          ['externalId', document.externalId],
          ['documentType', document.documentType],
          ['fileName', document.fileName],
          ['sourceUrl', document.sourceUrl],
          ['storageUrl', document.storageUrl],
          ['storageKey', document.storageKey],
          ['mimeType', document.mimeType],
          ['fileSize', document.fileSize],
          ['externalLoadId', document.externalLoadId],
          ['sourceMessageId', document.sourceMessageId],
          ['extractionStatus', document.extractionStatus],
        ]))],
      ]),
      sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl', 'load_url']) ?? null,
      owner: meta.dispatcher ?? meta.customer ?? null,
      sourceCreatedAt: firstDate(record, ['created_at', 'createdAt', 'created_date']),
      relatedLoadId: loadId,
      documents: meta.docs.documents,
    })
  }
  if (meta.notes || meta.tags.length > 0 || meta.eta) {
    items.push({
      externalId: `datatruck:load:${loadId}:notes`,
      kind: 'load',
      title: `Load ${meta.loadNumber ?? loadId} notes`,
      content: [
        `Datatruck load notes for ${meta.loadNumber ?? loadId}`,
        meta.notes ? `Notes: ${meta.notes}` : null,
        meta.tags.length > 0 ? `Tags: ${meta.tags.join(', ')}` : null,
        meta.eta ? `ETA: ${meta.eta}` : null,
      ].filter(Boolean).join('\n'),
      sourceMetadata: omitEmptyFields([
        ...Object.entries(meta.summaryMetadata),
        ['summaryType', 'notes'],
      ]),
      sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl', 'load_url']) ?? null,
      owner: meta.dispatcher ?? meta.customer ?? null,
      sourceCreatedAt: firstDate(record, ['created_at', 'createdAt', 'created_date']),
      relatedLoadId: loadId,
      documents: [],
    })
  }
  if (meta.status || meta.driver || meta.truck || meta.trailer || meta.dispatcher || meta.eta) {
    items.push({
      externalId: `datatruck:load:${loadId}:dispatch`,
      kind: 'load',
      title: `Load ${meta.loadNumber ?? loadId} dispatch`,
      content: [
        `Datatruck load dispatch summary for ${meta.loadNumber ?? loadId}`,
        meta.status ? `Status: ${meta.status}` : null,
        meta.driver ? `Driver: ${meta.driver}` : null,
        meta.truck ? `Truck: ${meta.truck}` : null,
        meta.trailer ? `Trailer: ${meta.trailer}` : null,
        meta.eta ? `ETA: ${meta.eta}` : null,
        meta.dispatcher ? `Dispatcher: ${meta.dispatcher}` : null,
      ].filter(Boolean).join('\n'),
      sourceMetadata: omitEmptyFields([
        ...Object.entries(meta.summaryMetadata),
        ['summaryType', 'dispatch'],
      ]),
      sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl', 'load_url']) ?? null,
      owner: meta.dispatcher ?? meta.customer ?? null,
      sourceCreatedAt: firstDate(record, ['created_at', 'createdAt', 'created_date']),
      relatedLoadId: loadId,
      documents: [],
    })
  }
  return items
}

export function normalizeDispatcherBoardItem(record: DatatruckRecord): DatatruckNormalizedItem {
  const meta = commonLoadMetadata(record, 'dispatcher_board')
  const loadId = meta.loadId ?? loadExternalId(record)
  return {
    externalId: `datatruck:dispatcher-board:${loadId}`,
    kind: 'dispatcher_board',
    title: `Dispatcher board ${meta.loadNumber ?? loadId}`,
    content: [
      `Datatruck dispatcher board item for ${meta.loadNumber ?? loadId}`,
      meta.status ? `Status: ${meta.status}` : null,
      meta.driver ? `Driver: ${meta.driver}` : null,
      meta.truck ? `Truck: ${meta.truck}` : null,
      meta.trailer ? `Trailer: ${meta.trailer}` : null,
      meta.pickupAt ? `Pickup window: ${meta.pickupAt}` : null,
      meta.deliveryAt ? `Delivery window: ${meta.deliveryAt}` : null,
      meta.eta ? `ETA: ${meta.eta}` : null,
      firstText(record, ['current_stop', 'currentStop', 'stop_name']) ? `Current stop: ${firstText(record, ['current_stop', 'currentStop', 'stop_name'])}` : null,
      firstText(record, ['late_flag', 'lateFlag', 'at_risk', 'atRisk']) ? `Flags: ${firstText(record, ['late_flag', 'lateFlag', 'at_risk', 'atRisk'])}` : null,
      meta.notes ? `Notes: ${meta.notes}` : null,
    ].filter(Boolean).join('\n'),
    sourceMetadata: omitEmptyFields([
      ...Object.entries(meta.summaryMetadata),
      ['summaryType', 'dispatch'],
      ['currentStop', firstText(record, ['current_stop', 'currentStop', 'stop_name'])],
    ]),
    sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl']) ?? null,
    owner: meta.dispatcher ?? meta.customer ?? null,
    sourceCreatedAt: firstDate(record, ['created_at', 'createdAt', 'created_date']),
    relatedLoadId: loadId,
    documents: [],
  }
}

export function normalizeDatatruckDriver(record: DatatruckRecord): DatatruckNormalizedItem {
  const id = recordId(record)
  const name = firstText(record, ['full_name', 'fullName', 'name', 'driver_name', 'driverName']) ?? `Driver ${id}`
  const assignedTruck = nestedText(record.assigned_truck) ?? nestedText(record.truck) ?? firstText(record, ['assigned_truck', 'truck', 'truck_number'])
  const assignedTrailer = nestedText(record.assigned_trailer) ?? nestedText(record.trailer) ?? firstText(record, ['assigned_trailer', 'trailer'])
  const status = firstText(record, ['status', 'driver_status', 'availability'])
  const phone = firstText(record, ['phone', 'phone_number', 'mobile'])
  const email = firstText(record, ['email', 'email_address'])
  const license = firstText(record, ['license_number', 'license', 'license_no'])
  const licenseExpiry = firstText(record, ['license_expiry', 'license_expires_at', 'license_expiration'])
  const notes = firstText(record, ['notes', 'note', 'comments'])
  const tags = nestedArray(record, ['tags', 'labels']).map((tag) => asText(tag)).filter((tag): tag is string => Boolean(tag))
  return {
    externalId: `datatruck:driver:${id}`,
    kind: 'driver',
    title: name,
    content: [
      `Datatruck driver ${name}`,
      status ? `Status: ${status}` : null,
      phone ? `Phone: ${phone}` : null,
      email ? `Email: ${email}` : null,
      assignedTruck ? `Assigned truck: ${assignedTruck}` : null,
      assignedTrailer ? `Assigned trailer: ${assignedTrailer}` : null,
      license ? `License: ${license}` : null,
      licenseExpiry ? `License expiry: ${licenseExpiry}` : null,
      tags.length > 0 ? `Tags: ${tags.join(', ')}` : null,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join('\n'),
    sourceMetadata: omitEmptyFields([
      ['recordType', 'driver'],
      ['driverId', id],
      ['name', name],
      ['status', status],
      ['phone', phone],
      ['email', email],
      ['assignedTruck', assignedTruck],
      ['assignedTrailer', assignedTrailer],
      ['license', license],
      ['licenseExpiry', licenseExpiry],
      ['tags', tags],
      ['notes', notes],
    ]),
    sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl']) ?? null,
    owner: name,
    sourceCreatedAt: firstDate(record, ['created_at', 'createdAt']),
    relatedLoadId: null,
    documents: [],
  }
}

export function normalizeDatatruckTruck(record: DatatruckRecord): DatatruckNormalizedItem {
  const id = recordId(record)
  const unit = firstText(record, ['unit_number', 'unitNumber', 'number', 'truck_number', 'truckNumber']) ?? `Truck ${id}`
  const status = firstText(record, ['status', 'truck_status'])
  const vin = firstText(record, ['vin', 'vehicle_identification_number'])
  const plate = firstText(record, ['plate_number', 'plateNumber', 'license_plate'])
  const driver = nestedText(record.assigned_driver) ?? firstText(record, ['assigned_driver', 'driver'])
  const trailer = nestedText(record.assigned_trailer) ?? firstText(record, ['assigned_trailer', 'trailer'])
  const maintenance = firstText(record, ['maintenance_status', 'maintenance', 'work_order'])
  const notes = firstText(record, ['notes', 'note', 'comments'])
  return {
    externalId: `datatruck:truck:${id}`,
    kind: 'truck',
    title: unit,
    content: [
      `Datatruck truck ${unit}`,
      status ? `Status: ${status}` : null,
      vin ? `VIN: ${vin}` : null,
      plate ? `Plate: ${plate}` : null,
      driver ? `Assigned driver: ${driver}` : null,
      trailer ? `Assigned trailer: ${trailer}` : null,
      maintenance ? `Maintenance: ${maintenance}` : null,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join('\n'),
    sourceMetadata: omitEmptyFields([
      ['recordType', 'truck'],
      ['truckId', id],
      ['unitNumber', unit],
      ['status', status],
      ['vin', vin],
      ['plate', plate],
      ['assignedDriver', driver],
      ['assignedTrailer', trailer],
      ['maintenance', maintenance],
      ['notes', notes],
    ]),
    sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl']) ?? null,
    owner: driver ?? null,
    sourceCreatedAt: firstDate(record, ['created_at', 'createdAt']),
    relatedLoadId: null,
    documents: [],
  }
}

export function normalizeDatatruckTrailer(record: DatatruckRecord): DatatruckNormalizedItem {
  const id = recordId(record)
  const unit = firstText(record, ['unit_number', 'unitNumber', 'number', 'trailer_number', 'trailerNumber']) ?? `Trailer ${id}`
  const status = firstText(record, ['status', 'trailer_status'])
  const vin = firstText(record, ['vin', 'vehicle_identification_number'])
  const plate = firstText(record, ['plate_number', 'plateNumber', 'license_plate'])
  const driver = nestedText(record.assigned_driver) ?? firstText(record, ['assigned_driver', 'driver'])
  const maintenance = firstText(record, ['maintenance_status', 'maintenance', 'work_order'])
  const notes = firstText(record, ['notes', 'note', 'comments'])
  return {
    externalId: `datatruck:trailer:${id}`,
    kind: 'trailer',
    title: unit,
    content: [
      `Datatruck trailer ${unit}`,
      status ? `Status: ${status}` : null,
      vin ? `VIN: ${vin}` : null,
      plate ? `Plate: ${plate}` : null,
      driver ? `Assigned driver: ${driver}` : null,
      maintenance ? `Maintenance: ${maintenance}` : null,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join('\n'),
    sourceMetadata: omitEmptyFields([
      ['recordType', 'trailer'],
      ['trailerId', id],
      ['unitNumber', unit],
      ['status', status],
      ['vin', vin],
      ['plate', plate],
      ['assignedDriver', driver],
      ['maintenance', maintenance],
      ['notes', notes],
    ]),
    sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl']) ?? null,
    owner: driver ?? null,
    sourceCreatedAt: firstDate(record, ['created_at', 'createdAt']),
    relatedLoadId: null,
    documents: [],
  }
}

export function normalizeDatatruckWorkOrder(record: DatatruckRecord): DatatruckNormalizedItem {
  const id = recordId(record)
  const workOrderId = firstText(record, ['work_order_id', 'workOrderId', 'id', 'uuid']) ?? id
  const asset = nestedText(record.asset) ?? nestedText(record.truck) ?? nestedText(record.trailer) ?? firstText(record, ['asset', 'truck', 'trailer'])
  const status = firstText(record, ['status', 'work_order_status'])
  const issue = firstText(record, ['issue', 'description', 'problem', 'reason'])
  const priority = firstText(record, ['priority', 'urgency'])
  const cost = firstText(record, ['cost', 'amount', 'total'])
  const notes = firstText(record, ['notes', 'note', 'comments'])
  const createdAt = firstDate(record, ['created_at', 'createdAt', 'opened_at'])
  const updatedAt = firstDate(record, ['updated_at', 'updatedAt'])
  const summaryMetadata = omitEmptyFields([
    ['recordType', 'work_order'],
    ['workOrderId', workOrderId],
    ['asset', asset],
    ['status', status],
    ['issue', issue],
    ['priority', priority],
    ['cost', cost],
    ['notes', notes],
    ['createdAt', dateText(createdAt)],
    ['updatedAt', dateText(updatedAt)],
  ])
  return {
    externalId: `datatruck:work-order:${workOrderId}`,
    kind: 'work_order',
    title: `Work order ${workOrderId}`,
    content: [
      `Datatruck work order ${workOrderId}`,
      asset ? `Asset: ${asset}` : null,
      status ? `Status: ${status}` : null,
      issue ? `Issue: ${issue}` : null,
      priority ? `Priority: ${priority}` : null,
      cost ? `Cost: ${cost}` : null,
      notes ? `Notes: ${notes}` : null,
      createdAt ? `Created: ${createdAt.toISOString()}` : null,
      updatedAt ? `Updated: ${updatedAt.toISOString()}` : null,
    ].filter(Boolean).join('\n'),
    sourceMetadata: summaryMetadata,
    sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl']) ?? null,
    owner: asset ?? null,
    sourceCreatedAt: createdAt,
    relatedLoadId: firstText(record, ['load_id', 'loadId', 'order_id', 'orderId']),
    documents: [],
  }
}

export function normalizeDatatruckRecord(kind: DatatruckEntityKind, record: DatatruckRecord): DatatruckNormalizedItem[] {
  if (kind === 'load') return normalizeDatatruckLoad(record)
  if (kind === 'dispatcher_board') return [normalizeDispatcherBoardItem(record)]
  if (kind === 'driver') return [normalizeDatatruckDriver(record)]
  if (kind === 'truck') return [normalizeDatatruckTruck(record)]
  if (kind === 'trailer') return [normalizeDatatruckTrailer(record)]
  return [normalizeDatatruckWorkOrder(record)]
}
