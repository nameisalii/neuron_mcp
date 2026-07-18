/**
 * @jest-environment node
 */
import { prisma } from '@/lib/db'
import { upsertKnowledgeItem } from '@/lib/datatruck/sync'
import { POST } from '../route'

jest.mock('@/lib/db', () => ({ prisma: { apiConnector: { findUnique: jest.fn() } } }))
jest.mock('@/lib/datatruck/sync', () => ({ upsertKnowledgeItem: jest.fn().mockResolvedValue(undefined) }))

const mockFindConnector = jest.mocked(prisma.apiConnector.findUnique)
const mockUpsert = jest.mocked(upsertKnowledgeItem)

const VALID_BODY = {
  workspaceId: 'workspace-1',
  module: 'invoices',
  eventType: 'invoice.updated',
  payload: { id: 'INV-1022', status: 'paid', total: '2450' },
}

function request(body: unknown, secret?: string) {
  return POST(new Request('http://localhost/api/integrations/datatruck/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-neuron-webhook-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFindConnector.mockResolvedValue({ id: 'connector-1' } as never)
})

afterEach(() => {
  delete process.env.DATATRUCK_WEBHOOK_SECRET
})

it('stays inactive (404) when no webhook secret is configured', async () => {
  const res = await request(VALID_BODY, 'anything')

  expect(res.status).toBe(404)
  expect(mockUpsert).not.toHaveBeenCalled()
})

it('rejects a wrong secret', async () => {
  process.env.DATATRUCK_WEBHOOK_SECRET = 'expected-secret'

  const res = await request(VALID_BODY, 'wrong-secret')

  expect(res.status).toBe(401)
})

it('rejects unknown modules', async () => {
  process.env.DATATRUCK_WEBHOOK_SECRET = 'expected-secret'

  const res = await request({ ...VALID_BODY, module: 'nonsense' }, 'expected-secret')

  expect(res.status).toBe(400)
})

it('rejects workspaces without a Datatruck connector', async () => {
  process.env.DATATRUCK_WEBHOOK_SECRET = 'expected-secret'
  mockFindConnector.mockResolvedValue(null as never)

  const res = await request(VALID_BODY, 'expected-secret')

  expect(res.status).toBe(404)
})

it('normalizes and upserts a valid event', async () => {
  process.env.DATATRUCK_WEBHOOK_SECRET = 'expected-secret'

  const res = await request(VALID_BODY, 'expected-secret')
  const body = await res.json()

  expect(res.status).toBe(200)
  expect(body.success).toBe(true)
  expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
    workspaceId: 'workspace-1',
    endpointKey: 'invoices',
    item: expect.objectContaining({
      externalId: 'datatruck:invoice-batch:INV-1022',
    }),
  }))
})

it('rejects stale events outside the replay window', async () => {
  process.env.DATATRUCK_WEBHOOK_SECRET = 'expected-secret'

  const res = await request({ ...VALID_BODY, sentAt: '2020-01-01T00:00:00.000Z' }, 'expected-secret')

  expect(res.status).toBe(400)
  expect(mockUpsert).not.toHaveBeenCalled()
})
