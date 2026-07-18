type DatatruckRecord = Record<string, unknown>

export type DatatruckEntityKind =
  | 'load'
  | 'dispatcher_board'
  | 'driver'
  | 'truck'
  | 'trailer'
  | 'work_order'
  | 'generic'

export interface DatatruckNormalizedDocument {
  externalId: string
  documentType: string
  fileName: string
  sourceUrl: string | null
  storageUrl: string | null
  storageKey: string | null
  mimeType: string | null
  fileSize: number | null
  extractionStatus: 'pending' | 'unsupported' | 'extracted' | 'remote_link'
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

function nestedRecord(value: unknown): DatatruckRecord | null {
  return isPlainObject(value) ? value : null
}

function firstNestedText(record: DatatruckRecord | null | undefined, keys: string[]): string | null {
  return record ? firstText(record, keys) : null
}

function firstNestedNumber(record: DatatruckRecord | null | undefined, keys: string[]): number | null {
  return record ? firstNumber(record, keys) : null
}

function nestedArray(record: DatatruckRecord, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function nestedObjectArray(record: DatatruckRecord, keys: string[]): DatatruckRecord[] {
  return nestedArray(record, keys).filter((value): value is DatatruckRecord => isPlainObject(value))
}

function titleFromKind(kind: DatatruckEntityKind): string {
  if (kind === 'dispatcher_board') return 'Dispatcher board'
  if (kind === 'work_order') return 'Work order'
  if (kind === 'generic') return 'Record'
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

function addIfBoolean(lines: string[], label: string, value: boolean | null | undefined) {
  if (value === null || value === undefined) return
  lines.push(`${label}: ${value ? 'yes' : 'no'}`)
}

function dateText(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function arrayText(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => nestedText(item)).filter((item): item is string => Boolean(item))
}

function fileNameFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const segment = parsed.pathname.split('/').filter(Boolean).at(-1)
    return segment ? decodeURIComponent(segment).replace(/[^\w.\- ]+/g, '_') : null
  } catch {
    const segment = url.split('?')[0]?.split('/').filter(Boolean).at(-1)
    return segment ? segment.replace(/[^\w.\- ]+/g, '_') : null
  }
}

function shortStableHash(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

function stopText(stop: DatatruckRecord, index: number): string {
  const stopType = firstText(stop, ['type', 'stop_type', 'kind']) ?? `Stop ${index + 1}`
  const locationRecord = nestedRecord(stop.location)
  const company = firstText(stop, ['company', 'company_name']) ?? firstNestedText(locationRecord, ['company', 'company_name'])
  const place = firstText(stop, ['place_name', 'place']) ?? firstNestedText(locationRecord, ['place_name', 'place', 'name'])
  const address = firstText(stop, ['address', 'address1', 'street']) ?? firstNestedText(locationRecord, ['address', 'address1', 'street'])
  const city = firstText(stop, ['city']) ?? firstNestedText(locationRecord, ['city'])
  const state = firstText(stop, ['state']) ?? firstNestedText(locationRecord, ['state'])
  const zip = firstText(stop, ['zip', 'zipcode', 'postal_code']) ?? firstNestedText(locationRecord, ['zip', 'zipcode', 'postal_code'])
  const contact = firstText(stop, ['contact_name', 'contact', 'contact_full_name'])
  const referenceId = firstText(stop, ['reference_id', 'reference', 'ref'])
  const pod = firstText(stop, ['proof_of_delivery', 'pod'])
  const note = firstText(stop, ['note', 'notes', 'comment'])
  const latitude = firstText(stop, ['latitude', 'lat']) ?? firstNestedText(locationRecord, ['latitude', 'lat'])
  const longitude = firstText(stop, ['longitude', 'lng', 'lon']) ?? firstNestedText(locationRecord, ['longitude', 'lng', 'lon'])
  const appointmentStart = firstText(stop, [
    'appointment_start',
    'appointment_from',
    'window_start',
    'pickup_window_start',
    'arrival_start',
    'eta_start',
  ])
  const appointmentEnd = firstText(stop, [
    'appointment_end',
    'appointment_to',
    'window_end',
    'pickup_window_end',
    'arrival_end',
    'eta_end',
  ])
  const locationParts = [
    company,
    place && place !== company ? place : null,
    address,
    [city, state, zip].filter(Boolean).join(', '),
  ].filter(Boolean)
  const detailParts = [
    locationParts.length ? locationParts.join(' · ') : null,
    contact ? `Contact ${contact}` : null,
    referenceId ? `Reference ${referenceId}` : null,
    appointmentStart || appointmentEnd ? `Appointment ${[appointmentStart, appointmentEnd].filter(Boolean).join(' - ')}` : null,
    pod ? `POD ${pod}` : null,
    latitude && longitude ? `Coordinates ${latitude}, ${longitude}` : null,
    note ? `Note ${note}` : null,
  ].filter(Boolean)
  return `${stopType}${detailParts.length ? `: ${detailParts.join(' · ')}` : ''}`
}

function summarizeStops(record: DatatruckRecord): string[] {
  const stops = nestedArray(record, ['stops', 'stop_list', 'route_stops', 'load_stops'])
  if (stops.length === 0) return []

  return stops.map((stop, index) => (isPlainObject(stop) ? stopText(stop, index) : `Stop ${index + 1}`))
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
    const documentType = firstText(document, ['file_type', 'document_type', 'type', 'kind', 'doc_type']) ?? 'OTHER'
    const sourceUrl = firstText(document, ['file_link', 'document_url', 'file_url', 'url', 'source_url'])
    const fileName = firstText(document, ['file_name', 'filename', 'name', 'title']) ?? fileNameFromUrl(sourceUrl) ?? `${documentType} ${index + 1}`
    const storageUrl = firstText(document, ['storage_url', 'download_url'])
    const storageKey = firstText(document, ['storage_key', 'key'])
    const mimeType = firstText(document, ['mime_type', 'content_type'])
    const fileSize = firstNumber(document, ['file_size', 'size'])
    const externalLoadId = firstText(document, ['load_id', 'external_load_id', 'order_id', 'order_number', 'load_number']) ?? fallbackLoadId
    const sourceMessageId = firstText(document, ['message_id', 'source_message_id'])
    const extractionStatus: DatatruckNormalizedDocument['extractionStatus'] = storageUrl || sourceUrl
      ? 'remote_link'
      : 'unsupported'
    const stableBasis = [
      fallbackLoadId,
      firstText(document, ['id', 'uuid']),
      documentType,
      sourceUrl,
      fileName,
      index + 1,
    ].filter(Boolean).join(':')
    const externalId = firstText(document, ['sourceExternalId'])
      ?? `datatruck:load:${fallbackLoadId ?? 'unknown'}:document:${shortStableHash(stableBasis)}`
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
  const loadNumber = firstText(record, ['load_number', 'loadNumber', 'order_number', 'orderNumber', 'load_id'])
  const shipmentId = firstText(record, ['shipment_id', 'shipmentId'])
  const status = firstText(record, ['status', 'load_status', 'dispatch_status'])
  const trip = nestedRecord(record.trip)
  const etaDetail = nestedRecord(record.eta_detail)
  const assignedDriverTruck = nestedRecord(record.assigned_driver_n_truck)
  const assignedCarrier = nestedRecord(record.assigned_carrier)
  const settlement = nestedRecord(trip?.settlement)
  const customer = firstText(record, ['customer__company_name', 'customer', 'customer_name', 'shipper', 'broker'])
  const carrier = firstText(record, ['mc_number__company_name'])
    ?? nestedText(assignedCarrier)
    ?? firstNestedText(trip, ['carrier_name', 'carrier__company_name', 'carrier'])
    ?? firstText(record, ['carrier'])
  const driver = firstNestedText(trip, ['driver__full_name', 'driver_full_name', 'driver_name'])
    ?? nestedText(record.driver)
    ?? nestedText(record.assigned_driver)
    ?? firstNestedText(assignedDriverTruck, ['driver__full_name', 'driver_full_name', 'driver_name'])
    ?? firstText(record, ['driver', 'driver_name'])
  const teamDriver = firstNestedText(trip, ['team_driver__full_name', 'team_driver_full_name', 'team_driver_name'])
    ?? firstText(record, ['team_driver__full_name', 'team_driver_full_name', 'team_driver'])
  const truck = firstNestedText(trip, ['truck__unit_number', 'truck_unit_number', 'truck_number'])
    ?? nestedText(record.truck)
    ?? nestedText(record.assigned_truck)
    ?? firstNestedText(assignedDriverTruck, ['truck__unit_number', 'truck_unit_number', 'truck_number'])
    ?? firstText(record, ['truck', 'truck_number'])
  const trailer = nestedText(record.trailer) ?? nestedText(record.assigned_trailer) ?? firstText(record, ['trailer', 'trailer_number'])
  const origin = firstNestedText(trip, ['pickup_location'])
    ?? firstText(record, ['origin', 'pickup', 'pickup_location', 'pickup_address', 'origin_location'])
  const destination = firstNestedText(trip, ['delivery_location'])
    ?? firstText(record, ['destination', 'delivery', 'delivery_location', 'delivery_address', 'destination_location'])
  const pickupAt = firstText(record, ['pickup_appointment_time', 'pickup_at', 'pickup_time', 'pickup_datetime', 'pickupDateTime'])
  const deliveryAt = firstText(record, ['delivery_appointment_time', 'delivery_at', 'delivery_time', 'delivery_datetime', 'deliveryDateTime'])
  const pickupTime = firstText(record, ['pickup_time'])
  const deliveryTime = firstText(record, ['delivery_time'])
  const eta = firstNestedText(etaDetail, ['eta_datetime'])
    ?? firstText(record, ['eta', 'estimated_arrival', 'estimated_arrival_time', 'estimated_delivery'])
  const etaOnTime = typeof etaDetail?.on_time === 'boolean' ? etaDetail.on_time : null
  const loadPay = firstNumber(record, ['load_pay', 'gross_pay', 'rate', 'price'])
  const totalOtherPay = firstNumber(record, ['total_other_pay'])
  const totalPay = firstNumber(record, ['total_pay'])
  const perMileRevenue = firstNumber(record, ['per_mile_revenue'])
  const miles = firstNumber(record, ['total_miles', 'estimated_mile', 'miles', 'distance'])
  const estimatedTime = firstText(record, ['estimated_time'])
  const tags = nestedArray(record, ['tags', 'labels']).map((tag) => nestedText(tag)).filter((tag): tag is string => Boolean(tag))
  const notes = firstText(record, ['notes', 'note', 'comments', 'dispatcher_notes', 'dispatch_notes'])
  const dispatcher = firstText(record, ['dispatcher__full_name', 'dispatcher', 'dispatcher_name', 'assigned_dispatcher'])
  const createdBy = firstText(record, ['created_by__full_name'])
  const office = firstText(record, ['office__office_name'])
  const transportationMode = firstText(record, ['transportation_mode'])
  const equipmentType = nestedText(record.equipment_type) ?? firstText(record, ['equipment_type'])
  const childEquipment = arrayText(record.equipment_type_child)
  const additionalEquipment = arrayText(record.additional_equipments)
  const driverRequirements = arrayText(record.driver_requirements)
  const freightRequirements = arrayText(record.freight_requirements)
  const minTemperature = firstText(record, ['min_temperature', 'temperature_min', 'temperature_minimum'])
  const maxTemperature = firstText(record, ['max_temperature', 'temperature_max', 'temperature_maximum'])
  const isFlagged = typeof record.is_flagged === 'boolean' ? record.is_flagged : null
  const flaggingReason = firstText(record, ['flagging_reason'])
  const tripId = firstNestedText(trip, ['trip_id', 'id'])
  const tripStatus = firstNestedText(trip, ['status'])
  const tripMiles = firstNestedNumber(trip, ['mile'])
  const tripEmptyMiles = firstNestedNumber(trip, ['empty_mile'])
  const tripTotalLoadPay = firstNestedNumber(trip, ['total_load_pay'])
  const settlementStatus = firstNestedText(settlement, ['status', 'settlement_status'])
  const settlementNumber = firstNestedText(settlement, ['settlement_number', 'number'])
  const settlementSent = typeof settlement?.is_sent === 'boolean' ? settlement.is_sent : null
  const batchOrders = nestedObjectArray(record, ['batch_orders'])
  const firstBatchOrder = batchOrders[0]
  const firstBatch = nestedRecord(firstBatchOrder?.batch)
  const invoiceNumber = firstNestedText(firstBatchOrder, ['invoice_number'])
  const invoiceSent = typeof firstBatchOrder?.is_sent === 'boolean' ? firstBatchOrder.is_sent : null
  const batchNumber = firstNestedText(firstBatch, ['batch_number'])
  const batchStatus = firstNestedText(firstBatch, ['status'])
  const createdAt = dateText(firstDate(record, ['created_datetime', 'created_at', 'createdAt', 'created_date']))
  const updatedAt = dateText(firstDate(record, ['updated_at', 'updatedAt', 'modified_at']))
  const docs = summarizeDocuments(record, loadId)
  const stops = summarizeStops(record)
  const summaryMetadata = omitEmptyFields([
    ['recordType', kind],
    ['loadId', loadId],
    ['loadNumber', loadNumber],
    ['shipmentId', shipmentId],
    ['status', status],
    ['customerCompanyName', customer],
    ['carrierCompanyName', carrier],
    ['driver', driver],
    ['teamDriver', teamDriver],
    ['truck', truck],
    ['trailer', trailer],
    ['origin', origin],
    ['destination', destination],
    ['pickupAt', pickupAt],
    ['deliveryAt', deliveryAt],
    ['pickupTime', pickupTime],
    ['deliveryTime', deliveryTime],
    ['eta', eta],
    ['etaOnTime', etaOnTime],
    ['loadPay', loadPay],
    ['totalOtherPay', totalOtherPay],
    ['totalPay', totalPay],
    ['perMileRevenue', perMileRevenue],
    ['miles', miles],
    ['estimatedTime', estimatedTime],
    ['tags', tags],
    ['notes', notes],
    ['dispatcher', dispatcher],
    ['createdBy', createdBy],
    ['office', office],
    ['transportationMode', transportationMode],
    ['equipmentType', equipmentType],
    ['equipmentTypeChild', childEquipment],
    ['additionalEquipments', additionalEquipment],
    ['driverRequirements', driverRequirements],
    ['freightRequirements', freightRequirements],
    ['minTemperature', minTemperature],
    ['maxTemperature', maxTemperature],
    ['isFlagged', isFlagged],
    ['flaggingReason', flaggingReason],
    ['tripId', tripId],
    ['tripStatus', tripStatus],
    ['tripMiles', tripMiles],
    ['tripEmptyMiles', tripEmptyMiles],
    ['tripTotalLoadPay', tripTotalLoadPay],
    ['settlementStatus', settlementStatus],
    ['settlementNumber', settlementNumber],
    ['settlementSent', settlementSent],
    ['invoiceNumber', invoiceNumber],
    ['invoiceSent', invoiceSent],
    ['batchNumber', batchNumber],
    ['batchStatus', batchStatus],
    ['createdAt', createdAt],
    ['updatedAt', updatedAt],
    ['documentsCount', docs.documents.length],
    ['stopsCount', stops.length],
  ])

  return {
    kind,
    loadId,
    loadNumber,
    shipmentId,
    status,
    customer,
    carrier,
    driver,
    teamDriver,
    truck,
    trailer,
    origin,
    destination,
    pickupAt,
    deliveryAt,
    pickupTime,
    deliveryTime,
    eta,
    etaOnTime,
    loadPay,
    totalOtherPay,
    totalPay,
    perMileRevenue,
    miles,
    estimatedTime,
    tags,
    notes,
    dispatcher,
    createdBy,
    office,
    transportationMode,
    equipmentType,
    childEquipment,
    additionalEquipment,
    driverRequirements,
    freightRequirements,
    minTemperature,
    maxTemperature,
    isFlagged,
    flaggingReason,
    tripId,
    tripStatus,
    tripMiles,
    tripEmptyMiles,
    tripTotalLoadPay,
    settlementStatus,
    settlementNumber,
    settlementSent,
    invoiceNumber,
    invoiceSent,
    batchNumber,
    batchStatus,
    createdAt,
    updatedAt,
    docs,
    stops,
    summaryMetadata,
  }
}

function buildSummaryLines({
  kind,
  loadId,
  loadNumber,
  shipmentId,
  status,
  customer,
  carrier,
  driver,
  teamDriver,
  truck,
  trailer,
  origin,
  destination,
  pickupAt,
  deliveryAt,
  pickupTime,
  deliveryTime,
  eta,
  etaOnTime,
  loadPay,
  totalPay,
  perMileRevenue,
  miles,
  tags,
  dispatcher,
  transportationMode,
  isFlagged,
  flaggingReason,
  createdAt,
  updatedAt,
}: ReturnType<typeof commonLoadMetadata>) {
  const lines = [`Datatruck ${titleFromKind(kind)} summary`]
  addIfValue(lines, 'ID', loadId)
  addIfValue(lines, 'Load', loadNumber)
  addIfValue(lines, 'Shipment ID', shipmentId)
  addIfValue(lines, 'Status', status)
  addIfValue(lines, 'Transportation mode', transportationMode)
  addIfValue(lines, 'Customer', customer)
  addIfValue(lines, 'Dispatcher', dispatcher)
  addIfValue(lines, 'Driver', driver)
  addIfValue(lines, 'Team driver', teamDriver)
  addIfValue(lines, 'Truck', truck)
  addIfValue(lines, 'Trailer', trailer)
  addIfValue(lines, 'Carrier', carrier)
  addIfValue(lines, 'Origin', origin)
  addIfValue(lines, 'Destination', destination)
  addIfValue(lines, 'Pickup appointment', pickupAt)
  addIfValue(lines, 'Delivery appointment', deliveryAt)
  addIfValue(lines, 'Pickup time', pickupTime)
  addIfValue(lines, 'Delivery time', deliveryTime)
  addIfValue(lines, 'ETA', eta)
  addIfBoolean(lines, 'ETA on time', etaOnTime)
  addIfNumber(lines, 'Total miles', miles)
  addIfNumber(lines, 'Load pay', loadPay)
  addIfNumber(lines, 'Total pay', totalPay)
  addIfNumber(lines, 'RPM', perMileRevenue)
  addIfBoolean(lines, 'Flagged', isFlagged)
  addIfValue(lines, 'Flagging reason', flaggingReason)
  if (tags.length > 0) addIfValue(lines, 'Tags', tags.join(', '))
  addIfValue(lines, 'Created', createdAt)
  addIfValue(lines, 'Updated', updatedAt)
  return lines.join('\n')
}

function recordId(record: DatatruckRecord): string {
  return firstText(record, ['id', 'uuid', 'load_id', 'loadId', 'order_id', 'orderId', 'work_order_id', 'workOrderId']) ?? 'unknown'
}

function humanizeEndpointKey(endpointKey: string): string {
  return endpointKey.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()
}

function genericExternalIdPrefix(endpointKey: string): string {
  if (endpointKey === 'invoices') return 'invoice-batch'
  if (endpointKey === 'payroll') return 'driver-settlement'
  if (endpointKey === 'fuel') return 'fuel'
  if (endpointKey === 'toll') return 'toll'
  if (endpointKey === 'ltlTrips') return 'ltl'
  return endpointKey
}

function genericModuleName(endpointKey: string): string {
  if (endpointKey === 'invoices') return 'invoice batch'
  if (endpointKey === 'payroll') return 'driver settlement'
  if (endpointKey === 'ltlTrips') return 'LTL trip'
  return humanizeEndpointKey(endpointKey)
}

function primitiveMetadata(record: DatatruckRecord, keys: string[]): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') metadata[key] = value
  }
  return metadata
}

function loadExternalId(record: DatatruckRecord): string {
  return firstText(record, ['id', 'uuid', 'load_id', 'loadId', 'order_id', 'orderId']) ?? recordId(record)
}

export function normalizeDatatruckLoad(record: DatatruckRecord): DatatruckNormalizedItem[] {
  const meta = commonLoadMetadata(record, 'load')
  const summary = buildSummaryLines(meta)
  const loadId = meta.loadId ?? loadExternalId(record)
  const sourceUrl = firstText(record, ['url', 'source_url', 'sourceUrl', 'load_url']) ?? null
  const sourceCreatedAt = firstDate(record, ['created_datetime', 'created_at', 'createdAt', 'created_date'])
  const owner = meta.dispatcher ?? meta.customer ?? null
  const baseMetadata = Object.entries(meta.summaryMetadata)
  const items: DatatruckNormalizedItem[] = [{
    externalId: `datatruck:load:${loadId}:summary`,
    kind: 'load',
    title: `Load ${meta.loadNumber ?? loadId}`,
    content: summary,
    sourceMetadata: omitEmptyFields([
      ...baseMetadata,
      ['loadNumber', meta.loadNumber],
      ['summaryType', 'load'],
    ]),
    sourceUrl,
    owner,
    sourceCreatedAt,
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
        ...baseMetadata,
        ['summaryType', 'stops'],
        ['stops', meta.stops],
      ]),
      sourceUrl,
      owner,
      sourceCreatedAt,
      relatedLoadId: loadId,
      documents: [],
    })
  }
  const financialLines = [
    `Datatruck load financials for ${meta.loadNumber ?? loadId}`,
    'Invoice information associated with this load.',
  ]
  addIfNumber(financialLines, 'Load pay', meta.loadPay)
  addIfNumber(financialLines, 'Other pay', meta.totalOtherPay)
  addIfNumber(financialLines, 'Total pay', meta.totalPay)
  addIfNumber(financialLines, 'Per-mile revenue', meta.perMileRevenue)
  addIfNumber(financialLines, 'Trip total load pay', meta.tripTotalLoadPay)
  addIfValue(financialLines, 'Settlement status', meta.settlementStatus)
  addIfValue(financialLines, 'Settlement number', meta.settlementNumber)
  addIfBoolean(financialLines, 'Settlement sent', meta.settlementSent)
  addIfValue(financialLines, 'Invoice number', meta.invoiceNumber)
  addIfBoolean(financialLines, 'Invoice sent', meta.invoiceSent)
  addIfValue(financialLines, 'Batch number', meta.batchNumber)
  addIfValue(financialLines, 'Batch status', meta.batchStatus)
  if (financialLines.length > 2) {
    items.push({
      externalId: `datatruck:load:${loadId}:financials`,
      kind: 'load',
      title: `Load ${meta.loadNumber ?? loadId} financials`,
      content: financialLines.join('\n'),
      sourceMetadata: omitEmptyFields([
        ...baseMetadata,
        ['summaryType', 'financials'],
      ]),
      sourceUrl,
      owner,
      sourceCreatedAt,
      relatedLoadId: loadId,
      documents: [],
    })
  }
  const assignmentLines = [
    `Datatruck load assignment for ${meta.loadNumber ?? loadId}`,
    meta.dispatcher ? `Dispatcher: ${meta.dispatcher}` : null,
    meta.driver ? `Assigned driver: ${meta.driver}` : null,
    meta.teamDriver ? `Team driver: ${meta.teamDriver}` : null,
    meta.truck ? `Truck: ${meta.truck}` : null,
    meta.trailer ? `Trailer: ${meta.trailer}` : null,
    meta.carrier ? `Carrier: ${meta.carrier}` : null,
    meta.tripId ? `Trip ID: ${meta.tripId}` : null,
    meta.tripStatus ? `Trip status: ${meta.tripStatus}` : null,
    meta.tripMiles !== null ? `Trip miles: ${meta.tripMiles}` : null,
    meta.tripEmptyMiles !== null ? `Trip empty miles: ${meta.tripEmptyMiles}` : null,
  ].filter(Boolean)
  if (assignmentLines.length > 1) {
    items.push({
      externalId: `datatruck:load:${loadId}:assignment`,
      kind: 'load',
      title: `Load ${meta.loadNumber ?? loadId} assignment`,
      content: assignmentLines.join('\n'),
      sourceMetadata: omitEmptyFields([
        ...baseMetadata,
        ['summaryType', 'assignment'],
      ]),
      sourceUrl,
      owner,
      sourceCreatedAt,
      relatedLoadId: loadId,
      documents: [],
    })
  }
  const requirementLines = [
    `Datatruck load requirements for ${meta.loadNumber ?? loadId}`,
    meta.equipmentType ? `Equipment type: ${meta.equipmentType}` : null,
    meta.childEquipment.length > 0 ? `Child equipment: ${meta.childEquipment.join(', ')}` : null,
    meta.additionalEquipment.length > 0 ? `Additional equipment: ${meta.additionalEquipment.join(', ')}` : null,
    meta.driverRequirements.length > 0 ? `Driver requirements: ${meta.driverRequirements.join(', ')}` : null,
    meta.freightRequirements.length > 0 ? `Freight requirements: ${meta.freightRequirements.join(', ')}` : null,
    meta.minTemperature ? `Minimum temperature: ${meta.minTemperature}` : null,
    meta.maxTemperature ? `Maximum temperature: ${meta.maxTemperature}` : null,
    meta.estimatedTime ? `Estimated time: ${meta.estimatedTime}` : null,
  ].filter(Boolean)
  if (requirementLines.length > 1) {
    items.push({
      externalId: `datatruck:load:${loadId}:requirements`,
      kind: 'load',
      title: `Load ${meta.loadNumber ?? loadId} requirements`,
      content: requirementLines.join('\n'),
      sourceMetadata: omitEmptyFields([
        ...baseMetadata,
        ['summaryType', 'requirements'],
      ]),
      sourceUrl,
      owner,
      sourceCreatedAt,
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
        ...baseMetadata,
        ['summaryType', 'documents'],
        ['hasAttachment', true],
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
      sourceUrl,
      owner,
      sourceCreatedAt,
      relatedLoadId: loadId,
      documents: meta.docs.documents,
    })
  }
  if (meta.notes || meta.tags.length > 0 || meta.eta || meta.flaggingReason || meta.isFlagged) {
    items.push({
      externalId: `datatruck:load:${loadId}:notes`,
      kind: 'load',
      title: `Load ${meta.loadNumber ?? loadId} notes`,
      content: [
        `Datatruck load notes for ${meta.loadNumber ?? loadId}`,
        meta.notes ? `Notes: ${meta.notes}` : null,
        meta.tags.length > 0 ? `Tags: ${meta.tags.join(', ')}` : null,
        meta.eta ? `ETA: ${meta.eta}` : null,
        meta.etaOnTime !== null ? `ETA on time: ${meta.etaOnTime ? 'yes' : 'no'}` : null,
        meta.isFlagged !== null ? `Flagged: ${meta.isFlagged ? 'yes' : 'no'}` : null,
        meta.flaggingReason ? `Flagging reason: ${meta.flaggingReason}` : null,
      ].filter(Boolean).join('\n'),
      sourceMetadata: omitEmptyFields([
        ...baseMetadata,
        ['summaryType', 'notes'],
      ]),
      sourceUrl,
      owner,
      sourceCreatedAt,
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
  if (kind === 'generic') return [genericDatatruckRecordNormalizer('record', record)]
  return [normalizeDatatruckWorkOrder(record)]
}

export function genericDatatruckRecordNormalizer(endpointKey: string, record: DatatruckRecord): DatatruckNormalizedItem {
  const id = firstText(record, ['id', 'uuid', 'number', 'reference', 'reference_number', 'code']) ?? recordId(record)
  const title = firstText(record, [
    'title',
    'name',
    'full_name',
    'display_name',
    'number',
    'invoice_number',
    'bill_number',
    'reference',
    'reference_number',
    'code',
  ]) ?? `${humanizeEndpointKey(endpointKey)} ${id}`
  const status = firstText(record, ['status', 'state', 'stage'])
  const createdAt = firstDate(record, ['created_at', 'createdAt', 'created_date', 'date'])
  const updatedAt = firstDate(record, ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt'])
  const amount = firstText(record, ['amount', 'total', 'pay', 'cost', 'price', 'rate', 'balance'])
  const notes = firstText(record, ['notes', 'note', 'description', 'comments', 'memo'])
  const owner = firstText(record, ['owner', 'assigned_to', 'dispatcher', 'driver', 'vendor', 'customer'])
  const company = firstText(record, ['company', 'company_name', 'companyName'])
  const customer = firstText(record, ['customer', 'customer_name', 'customerName', 'client'])
  const driver = firstText(record, ['driver', 'driver_name', 'driverName'])
  const moduleName = genericModuleName(endpointKey)
  const externalIdPrefix = genericExternalIdPrefix(endpointKey)
  const metadataKeys = [
    'id',
    'uuid',
    'number',
    'reference',
    'reference_number',
    'code',
    'title',
    'name',
    'status',
    'state',
    'amount',
    'total',
    'pay',
    'cost',
    'price',
    'rate',
    'balance',
    'created_at',
    'createdAt',
    'updated_at',
    'updatedAt',
    'modified_at',
    'modifiedAt',
  ]

  return {
    externalId: `datatruck:${externalIdPrefix}:${id}`,
    kind: 'generic',
    title,
    content: [
      `Datatruck ${moduleName}: ${title}`,
      status ? `Status: ${status}` : null,
      customer ? `Customer: ${customer}` : null,
      company ? `Company: ${company}` : null,
      driver ? `Driver: ${driver}` : null,
      amount ? `Amount: ${amount}` : null,
      updatedAt ? `Updated: ${updatedAt.toISOString()}` : null,
      createdAt ? `Created: ${createdAt.toISOString()}` : null,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join('\n'),
    sourceMetadata: omitEmptyFields([
      ['endpointKey', endpointKey],
      ['recordType', endpointKey],
      ['module', moduleName],
      ['sourceExternalId', id],
      ['title', title],
      ['status', status],
      ['amount', amount],
      ['createdAt', dateText(createdAt)],
      ['updatedAt', dateText(updatedAt)],
      ['notes', notes],
      ['fields', primitiveMetadata(record, metadataKeys)],
    ]),
    sourceUrl: firstText(record, ['url', 'source_url', 'sourceUrl']) ?? null,
    owner,
    sourceCreatedAt: createdAt,
    relatedLoadId: firstText(record, ['load_id', 'loadId', 'order_id', 'orderId']),
    documents: [],
  }
}
