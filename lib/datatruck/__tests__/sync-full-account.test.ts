/**
 * @jest-environment node
 */
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { getValidDatatruckInternalAccessToken } from '../auth'
import { syncDatatruckFullAccountKnowledge } from '../sync'

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    documentAttachment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn() }))
jest.mock('../auth', () => ({ getValidDatatruckInternalAccessToken: jest.fn() }))

const mockKnowledgeFindFirst = jest.mocked(prisma.knowledgeItem.findFirst)
const mockKnowledgeCreate = jest.mocked(prisma.knowledgeItem.create)
const mockDocumentFindFirst = jest.mocked(prisma.documentAttachment.findFirst)
const mockDocumentCreate = jest.mocked(prisma.documentAttachment.create)
const mockToken = jest.mocked(getValidDatatruckInternalAccessToken)
const originalFetch = global.fetch

beforeEach(() => {
  jest.clearAllMocks()
  mockKnowledgeFindFirst.mockResolvedValue(null as never)
  mockKnowledgeCreate.mockResolvedValue({ id: 'item-1' } as never)
  mockDocumentFindFirst.mockResolvedValue(null as never)
  mockDocumentCreate.mockResolvedValue({ id: 'doc-1' } as never)
  jest.mocked(generateEmbedding).mockResolvedValue([0.1])
  jest.mocked(upsertEmbedding).mockResolvedValue(undefined)
  mockToken.mockResolvedValue('internal-token')
})

afterEach(() => {
  global.fetch = originalFetch
})

it('syncs full-account internal modules with stable generic IDs', async () => {
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes('/api/v1/invoice/batches/list/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ count: 1, next: null, results: [{ id: 'batch-1', invoice_number: 'INV-1', status: 'open', amount: '1200' }] }),
      } as Response
    }
    return { ok: true, status: 200, json: async () => ({ count: 0, next: null, results: [] }) } as Response
  }) as never

  const result = await syncDatatruckFullAccountKnowledge('ws-1', { workspaceId: 'ws-1', companyName: 'sflogistics' })

  expect(result.ok).toBe(true)
  expect(result.endpoints.invoices.fetched).toBe(1)
  expect(mockKnowledgeCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      workspaceId: 'ws-1',
      source: 'datatruck',
      sourceExternalId: 'datatruck:invoice-batch:batch-1',
      sourceMetadata: expect.objectContaining({ endpointKey: 'invoices' }),
    }),
  }))
  expect(JSON.stringify(mockKnowledgeCreate.mock.calls)).not.toContain('internal-token')
})

it('continues full-account sync when one internal endpoint fails', async () => {
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes('/api/v1/customer/')) return { ok: false, status: 500, json: async () => ({}) } as Response
    if (url.includes('/api/v1/invoice/batches/list/')) {
      return { ok: true, status: 200, json: async () => ({ count: 1, next: null, results: [{ id: 'batch-1' }] }) } as Response
    }
    return { ok: true, status: 200, json: async () => ({ count: 0, next: null, results: [] }) } as Response
  }) as never

  const result = await syncDatatruckFullAccountKnowledge('ws-1', { workspaceId: 'ws-1', companyName: 'sflogistics' })

  expect(result.ok).toBe(false)
  expect(result.failedEndpoints).toContain('customers')
  expect(result.endpoints.invoices.fetched).toBe(1)
})
