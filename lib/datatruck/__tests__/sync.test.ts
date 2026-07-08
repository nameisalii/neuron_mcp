/**
 * @jest-environment node
 */
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { normalizeDatatruckDriver, normalizeDatatruckLoad, normalizeDispatcherBoardItem, syncDatatruckKnowledge } from '../sync'

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    documentAttachment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn() }))

const mockFindFirst = jest.mocked(prisma.knowledgeItem.findFirst)
const mockCreate = jest.mocked(prisma.knowledgeItem.create)
const mockUpdate = jest.mocked(prisma.knowledgeItem.update)
const mockDocumentFindFirst = jest.mocked(prisma.documentAttachment.findFirst)
const mockDocumentCreate = jest.mocked(prisma.documentAttachment.create)
const mockDocumentUpdate = jest.mocked(prisma.documentAttachment.update)
const mockGenerateEmbedding = jest.mocked(generateEmbedding)
const mockUpsertEmbedding = jest.mocked(upsertEmbedding)

const connection = {
  apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi',
  apiToken: 'secret-token',
}

const originalFetch = global.fetch

function mockApi(recordsByPath: Record<string, unknown[]>) {
  global.fetch = jest.fn(async (url: string) => {
    const match = Object.entries(recordsByPath)
      .sort(([a], [b]) => b.length - a.length)
      .find(([path]) => String(url).includes(path))
    return {
      ok: true,
      status: 200,
      json: async () => ({ count: match?.[1].length ?? 0, next: null, results: match?.[1] ?? [] }),
    }
  }) as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFindFirst.mockResolvedValue(null as never)
  mockCreate.mockResolvedValue({ id: 'item-1' } as never)
  mockUpdate.mockResolvedValue({} as never)
  mockDocumentFindFirst.mockResolvedValue(null as never)
  mockDocumentCreate.mockResolvedValue({ id: 'doc-1' } as never)
  mockDocumentUpdate.mockResolvedValue({} as never)
  mockGenerateEmbedding.mockResolvedValue([0.1, 0.2])
  mockUpsertEmbedding.mockResolvedValue(undefined)
})

afterEach(() => {
  global.fetch = originalFetch
})

it('normalizes driver, load, and dispatcher board records into readable content', () => {
  const driver = normalizeDatatruckDriver({
    id: 68,
    full_name: 'Mohammad Faisal Hussain Khail',
    status: 'available',
    assigned_truck: { unit_number: '1998' },
    notes: null,
  })
  expect(driver.title).toBe('Mohammad Faisal Hussain Khail')
  expect(driver.content).toContain('Datatruck driver Mohammad Faisal Hussain Khail')
  expect(driver.content).toContain('Assigned truck: 1998')

  const loadItems = normalizeDatatruckLoad({
    id: 12345,
    load_number: '12345',
    status: 'late',
    customer_name: 'Acme',
    driver: { full_name: 'Jane Doe' },
    truck: { unit_number: '44' },
    trailer: { unit_number: 'TR-9' },
    stops: [
      { type: 'Pickup', location: 'Dallas, TX', window_start: '2026-07-01T10:00:00Z', window_end: '2026-07-01T12:00:00Z' },
    ],
    documents: [{ id: 'doc-1', document_type: 'BOL', file_name: 'BOL.pdf', file_url: 'https://example.com/bol.pdf' }],
  })
  expect(loadItems.map((item) => item.externalId)).toEqual([
    'datatruck:load:12345:summary',
    'datatruck:load:12345:stops',
    'datatruck:load:12345:documents',
    'datatruck:load:12345:dispatch',
  ])
  expect(loadItems[0].content).toContain('Load: 12345')
  expect(loadItems[2].documents).toHaveLength(1)

  const dispatcher = normalizeDispatcherBoardItem({
    id: 'dispatch-1',
    load_number: '12345',
    status: 'at_risk',
    driver: { full_name: 'Jane Doe' },
    truck: { unit_number: '44' },
    trailer: { unit_number: 'TR-9' },
    current_stop: 'Pickup',
    at_risk: true,
  })
  expect(dispatcher.content).toContain('Current stop: Pickup')
  expect(dispatcher.content).toContain('Status: at_risk')
})

it('creates knowledge items for fetched records with source datatruck', async () => {
  mockApi({ '/drivers/list/': [{ id: 68, status: 'available' }] })

  const result = await syncDatatruckKnowledge('workspace-1', connection)

  expect(result.ok).toBe(true)
  expect(result.created).toBe(1)
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      workspaceId: 'workspace-1',
      source: 'datatruck',
      sourceExternalId: 'datatruck:driver:68',
      category: 'reference',
      visibility: 'team',
    }),
  }))
  const content = (mockCreate.mock.calls[0][0] as { data: { content: string } }).data.content
  expect(content).toContain('Datatruck driver Driver 68')
  expect(content).not.toContain('secret-token')
})

it('skips unchanged records and updates changed ones (idempotent re-sync)', async () => {
  mockApi({ '/drivers/list/': [{ id: 68, status: 'available' }] })
  const firstRun = await syncDatatruckKnowledge('workspace-1', connection)
  expect(firstRun.created).toBe(1)

  const storedHash = (mockCreate.mock.calls[0][0] as { data: { contentHash: string } }).data.contentHash
  mockFindFirst.mockResolvedValue({ id: 'item-1', contentHash: storedHash } as never)
  const secondRun = await syncDatatruckKnowledge('workspace-1', connection)
  expect(secondRun.created).toBe(0)
  expect(secondRun.skipped).toBeGreaterThanOrEqual(1)

  mockApi({ '/drivers/list/': [{ id: 68, status: 'on_vacation' }] })
  const thirdRun = await syncDatatruckKnowledge('workspace-1', connection)
  expect(thirdRun.updated).toBe(1)
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'item-1' },
    data: expect.objectContaining({ content: expect.stringContaining('on_vacation') }),
  }))
})

it('keeps the DB item when embedding fails and counts the error', async () => {
  mockApi({ '/drivers/list/': [{ id: 68, status: 'available' }] })
  mockGenerateEmbedding.mockRejectedValue(new Error('no api key'))

  const result = await syncDatatruckKnowledge('workspace-1', connection)

  expect(result.created).toBe(1)
  expect(result.embeddingErrors).toBeGreaterThanOrEqual(1)
})

it('creates Datatruck knowledge items and attachments across all endpoints', async () => {
  mockApi({
    '/orders/dispatcher-board/list/': [
      { id: 'dispatch-1', load_number: '12345', status: 'at_risk', current_stop: 'Pickup' },
    ],
    '/orders/': [
      {
        id: 12345,
        load_number: '12345',
        status: 'in_transit',
        customer_name: 'Acme',
        driver: { full_name: 'Jane Doe' },
        truck: { unit_number: '44' },
        trailer: { unit_number: 'TR-9' },
        notes: 'Call when arriving',
        tags: ['hot'],
        documents: [{ id: 'doc-1', document_type: 'BOL', file_name: 'BOL.pdf', file_url: 'https://example.com/bol.pdf' }],
      },
    ],
    '/drivers/list/': [{ id: 68, full_name: 'Jane Doe', status: 'available', assigned_truck: { unit_number: '44' } }],
    '/trucks/list/': [{ id: 44, unit_number: '44', status: 'active', assigned_driver: { full_name: 'Jane Doe' } }],
    '/trailers/list/': [{ id: 9, unit_number: 'TR-9', status: 'available' }],
    '/work-orders/': [{ id: 'wo-1', work_order_id: 'WO-1', status: 'open', issue: 'Replace tire', priority: 'high' }],
  })

  const result = await syncDatatruckKnowledge('workspace-1', connection)

  expect(result.ok).toBe(true)
  expect(result.totalFetched).toBeGreaterThan(0)
  expect(result.created).toBeGreaterThan(0)
  expect(result.endpoints.loads.fetched).toBe(1)
  expect(result.endpoints.drivers.fetched).toBe(1)
  expect(mockCreate.mock.calls.some(([args]) => (args as { data: { sourceExternalId: string } }).data.sourceExternalId === 'datatruck:load:12345:summary')).toBe(true)
  expect(mockCreate.mock.calls.some(([args]) => (args as { data: { sourceExternalId: string } }).data.sourceExternalId === 'datatruck:driver:68')).toBe(true)
  expect(mockDocumentCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      workspaceId: 'workspace-1',
      source: 'datatruck',
      sourceExternalId: 'doc-1',
      externalLoadId: '12345',
      documentType: 'BOL',
      extractionStatus: 'pending',
    }),
  }))
  expect(result.loadTotals.count).toBe(1)
  expect(result.loadTotals.pay).toBe(0)
  expect(result.message).toBe('Datatruck sync complete.')
})

it('skips unchanged records and updates changed ones without duplicating attachments', async () => {
  mockApi({ '/drivers/list/': [{ id: 68, status: 'available' }] })
  const firstRun = await syncDatatruckKnowledge('workspace-1', connection)
  expect(firstRun.created).toBeGreaterThan(0)

  const storedHash = (mockCreate.mock.calls.find(([args]) => (args as { data: { sourceExternalId: string } }).data.sourceExternalId === 'datatruck:driver:68')?.[0] as { data: { contentHash: string } }).data.contentHash
  mockFindFirst.mockResolvedValue({ id: 'item-1', contentHash: storedHash, typeOverriddenByUser: false } as never)
  const secondRun = await syncDatatruckKnowledge('workspace-1', connection)
  expect(secondRun.skipped).toBeGreaterThan(0)

  mockApi({ '/drivers/list/': [{ id: 68, status: 'on_vacation' }] })
  const thirdRun = await syncDatatruckKnowledge('workspace-1', connection)
  expect(thirdRun.updated).toBeGreaterThan(0)
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'item-1' },
    data: expect.objectContaining({ content: expect.stringContaining('on_vacation') }),
  }))
})

it('continues syncing the remaining endpoints when one endpoint fails', async () => {
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).includes('/drivers/list/')) {
      return { ok: false, status: 500, json: async () => ({}) } as Response
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ count: 1, next: null, results: [{ id: String(url).split('/').pop() ?? 'x' }] }),
    } as Response
  }) as never

  const result = await syncDatatruckKnowledge('workspace-1', connection)

  expect(result.ok).toBe(false)
  expect(result.failedEndpoints).toContain('drivers')
  expect(result.totalFetched).toBeGreaterThan(0)
  expect(result.endpoints.loads.fetched).toBeGreaterThan(0)
  expect(mockCreate).toHaveBeenCalled()
})
