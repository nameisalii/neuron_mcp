import { prisma } from '@/lib/db'
import { createTtEldClient } from '../client'
import { syncTtEldKnowledge, upsertTtEldKnowledge } from '../sync'
import { normalizeRealtimeUnit } from '../normalize'

jest.mock('@/lib/db', () => ({ prisma: { knowledgeItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() } } }))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn().mockResolvedValue([0.1]) }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn() }))
jest.mock('../client', () => ({ createTtEldClient: jest.fn() }))

const counters = () => ({ created: 0, updated: 0, skipped: 0, embeddingErrors: 0 })
const item = normalizeRealtimeUnit({ truck_number: '12', vin: 'VIN1', coordinates: { lat: 1, lng: 2 }, timestamp: '2026-01-01T00:00:00Z' })

beforeEach(() => { jest.clearAllMocks(); (prisma.knowledgeItem.create as jest.Mock).mockResolvedValue({ id: 'ki-1' }); (prisma.knowledgeItem.update as jest.Mock).mockResolvedValue({}) })

it('creates stable workspace-scoped knowledge and skips a duplicate', async () => {
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValueOnce(null)
  const first = counters(); await upsertTtEldKnowledge('ws-1', item, first)
  expect(prisma.knowledgeItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'ws-1', source: 'five_eld', sourceExternalId: 'fiveeld:unit:VIN1' } }))
  expect(first.created).toBe(1)
  const createdData = (prisma.knowledgeItem.create as jest.Mock).mock.calls[0][0].data
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue({ id: 'ki-1', contentHash: createdData.contentHash, typeOverriddenByUser: false })
  const second = counters(); await upsertTtEldKnowledge('ws-1', item, second)
  expect(second.skipped).toBe(1)
  expect(prisma.knowledgeItem.create).toHaveBeenCalledTimes(1)
})

it('updates changed content while preserving a user category', async () => {
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue({ id: 'ki-1', contentHash: 'old', typeOverriddenByUser: true })
  const result = counters(); await upsertTtEldKnowledge('ws-2', item, result)
  expect((prisma.knowledgeItem.update as jest.Mock).mock.calls[0][0].data.category).toBeUndefined()
  expect(result.updated).toBe(1)
})

it('continues after a partial endpoint failure', async () => {
  ;(createTtEldClient as jest.Mock).mockReturnValue({
    getRealtimeUnitsByUsdot: jest.fn().mockResolvedValue([]), getCurrentUnits: jest.fn().mockRejectedValue(new Error('fail')),
    getDrivers: jest.fn().mockResolvedValue([]), getActiveUnits: jest.fn().mockResolvedValue([]),
  })
  const result = await syncTtEldKnowledge('ws-1', { usdot: '1', apiKey: 'a', providerToken: 'b' })
  expect(result.ok).toBe(true)
  expect(result.failedModules).toEqual(['current_units'])
})
