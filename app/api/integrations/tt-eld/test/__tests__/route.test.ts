/** @jest-environment node */
import { auth } from '@clerk/nextjs/server'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { TtEldError } from '@/lib/tteld/client'
import { probeFiveEldCapabilities } from '@/lib/tteld/probe'
import { POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/tteld/probe', () => ({ probeFiveEldCapabilities: jest.fn(), primaryProbeError: (result: { failures: Array<{ stage: string; error: unknown }> }) => result.failures[0] ?? null }))

const capabilities = { currentUnits: false, drivers: false, realtimeUnitsByUsdot: false, unitByVin: 'unknown' as const, historicalTracking: 'unknown' as const }
const success = (overrides: Partial<typeof capabilities>) => ({ ok: true, capabilities: { ...capabilities, ...overrides }, warnings: overrides.realtimeUnitsByUsdot === false ? [{ code: 'realtime_units_by_usdot_unavailable', message: 'The real-time USDOT endpoint was not available for this account, but current units/drivers are accessible.' }] : [], counts: { currentUnits: 1, drivers: 1, realtimeUnits: overrides.realtimeUnitsByUsdot ? 1 : 0 }, failures: [] })
const failure = (failures: Array<{ stage: string; error: unknown }>) => ({ ok: false, capabilities, warnings: [], counts: { currentUnits: 0, drivers: 0, realtimeUnits: 0 }, failures })
function request(body: unknown) { return POST(new Request('http://localhost/api/integrations/five-eld/test', { method: 'POST', body: JSON.stringify(body) })) }
const body = { companyId: '1489081', usdot: '4444355', apiKey: 'synthetic-secret', providerToken: '' }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(auth).mockResolvedValue({ userId: 'u1' } as never)
  jest.mocked(requireWorkspaceMember).mockResolvedValue({ workspaceId: 'ws-1' } as never)
  jest.mocked(probeFiveEldCapabilities).mockResolvedValue(success({ currentUnits: true, drivers: true, realtimeUnitsByUsdot: true }) as never)
})

it('accepts empty or missing provider token and starts the capability probe', async () => {
  for (const input of [body, { ...body, providerToken: undefined }]) expect((await request(input)).status).toBe(200)
  expect(probeFiveEldCapabilities).toHaveBeenCalledWith(expect.objectContaining({ companyId: '1489081', usdot: '4444355', providerToken: undefined }))
})

it.each([
  ['companyId', { usdot: '4444355', apiKey: 'synthetic-secret' }],
  ['usdot', { companyId: '1489081', apiKey: 'synthetic-secret' }],
  ['apiKey', { companyId: '1489081', usdot: '4444355' }],
])('returns a safe validation issue for missing %s', async (field, input) => {
  const response = await request(input); const json = await response.json()
  expect(response.status).toBe(400); expect(json.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field })])); expect(JSON.stringify(json)).not.toContain('synthetic-secret')
})

it.each([
  ['current units', { currentUnits: true, realtimeUnitsByUsdot: false }],
  ['drivers', { drivers: true, realtimeUnitsByUsdot: false }],
] as const)('accepts limited access when %s succeeds and realtime USDOT is unavailable', async (_label, caps) => {
  jest.mocked(probeFiveEldCapabilities).mockResolvedValue(success(caps) as never)
  const response = await request(body); const json = await response.json()
  expect(response.status).toBe(200); expect(json.ok).toBe(true); expect(json.capabilities.realtimeUnitsByUsdot).toBe(false)
  expect(json.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'realtime_units_by_usdot_unavailable' })]))
  expect(json.message).toMatch(/Live GPS by USDOT was not available/)
})

it('reports live GPS capability when realtime USDOT succeeds', async () => {
  jest.mocked(probeFiveEldCapabilities).mockResolvedValue(success({ realtimeUnitsByUsdot: true }) as never)
  const json = await (await request(body)).json()
  expect(json).toEqual(expect.objectContaining({ ok: true, message: 'Five ELD connected with live GPS.', capabilities: expect.objectContaining({ realtimeUnitsByUsdot: true }) }))
})

it('fails with an endpoint-set message only when all endpoints return 404', async () => {
  const failures = ['current_units', 'drivers', 'realtime_units_by_usdot'].map((stage) => ({ stage, error: new TtEldError('not_found', 404) }))
  jest.mocked(probeFiveEldCapabilities).mockResolvedValue(failure(failures) as never)
  const response = await request({ ...body, providerToken: 'synthetic-provider' }); const json = await response.json()
  expect(response.status).toBe(422); expect(json.code).toBe('endpoint_set_not_found'); expect(json.message).toMatch(/USDOT or endpoint set/)
  expect(JSON.stringify(json)).not.toMatch(/synthetic-secret|synthetic-provider/)
})

it.each([401, 403])('returns safe auth guidance for upstream %s', async (status) => {
  jest.mocked(probeFiveEldCapabilities).mockResolvedValue(failure([{ stage: 'current_units', error: new TtEldError('unauthorized', status) }]) as never)
  const json = await (await request(body)).json()
  expect(json.code).toBe('missing_provider_token_or_invalid_api_key'); expect(json.upstreamStatus).toBe(status); expect(JSON.stringify(json)).not.toContain('synthetic-secret')
})
