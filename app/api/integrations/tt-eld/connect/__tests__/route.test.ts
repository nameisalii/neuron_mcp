/** @jest-environment node */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { encodeTtEldCredentials } from '@/lib/tteld/credentials'
import { probeFiveEldCapabilities } from '@/lib/tteld/probe'
import { POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/db', () => ({ prisma: { apiConnector: { upsert: jest.fn() } } }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/tteld/client', () => ({ ttEldFriendlyError: jest.fn(() => 'TT ELD rejected these credentials. Check your API key, provider token, and USDOT.') }))
jest.mock('@/lib/tteld/credentials', () => ({ TTELD_SOURCE: 'five_eld', TTELD_CAPABILITIES: ['realtime_tracking'], encodeTtEldCredentials: jest.fn(() => 'encrypted-bundle') }))
jest.mock('@/lib/tteld/probe', () => ({ probeFiveEldCapabilities: jest.fn(), primaryProbeError: (result: { failures: Array<{ error: unknown }> }) => result.failures[0] ?? null }))

function request(body: unknown) { return POST(new Request('http://localhost/api/integrations/tt-eld/connect', { method: 'POST', body: JSON.stringify(body) })) }
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(auth).mockResolvedValue({ userId: 'u1' } as never)
  jest.mocked(requireWorkspaceMember).mockResolvedValue({ workspaceId: 'ws-1', member: { displayName: 'Ali' } } as never)
  jest.mocked(probeFiveEldCapabilities).mockResolvedValue({ ok: true, capabilities: { currentUnits: true, drivers: true, realtimeUnitsByUsdot: false, unitByVin: 'unknown', historicalTracking: 'unknown' }, warnings: [{ code: 'realtime_units_by_usdot_unavailable', message: 'limited' }], counts: { currentUnits: 1, drivers: 1, realtimeUnits: 0 }, failures: [] } as never)
  jest.mocked(prisma.apiConnector.upsert).mockResolvedValue({ id: 'c1', status: 'connected' } as never)
})

it('validates all required fields', async () => { expect((await request({ usdot: '123' })).status).toBe(400); expect(prisma.apiConnector.upsert).not.toHaveBeenCalled() })
it('tests credentials and saves only the encrypted credential bundle', async () => {
  const body = { companyId: '1489081', usdot: '123', apiKey: 'api-secret', providerToken: 'provider-secret' }
  const response = await request(body); expect(response.status).toBe(200)
  expect(encodeTtEldCredentials).toHaveBeenCalledWith(body)
  expect(prisma.apiConnector.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId_sourceKey: { workspaceId: 'ws-1', sourceKey: 'five_eld' } }, create: expect.objectContaining({ encryptedCredential: 'encrypted-bundle', metadata: expect.objectContaining({ companyId: '1489081', usdot: '123', capabilities: expect.objectContaining({ currentUnits: true, realtimeUnitsByUsdot: false }) }) }) }))
  expect(JSON.stringify(await response.json())).not.toMatch(/api-secret|provider-secret/)
})
it('does not save when TT ELD rejects the test', async () => {
  jest.mocked(probeFiveEldCapabilities).mockResolvedValue({ ok: false, capabilities: {}, warnings: [], counts: {}, failures: [{ stage: 'current_units', error: new Error('secret provider response') }] } as never)
  const response = await request({ companyId: '1489081', usdot: '123', apiKey: 'bad', providerToken: 'bad' })
  expect(response.status).toBe(422); expect(prisma.apiConnector.upsert).not.toHaveBeenCalled(); expect(JSON.stringify(await response.json())).not.toContain('secret provider response')
})
