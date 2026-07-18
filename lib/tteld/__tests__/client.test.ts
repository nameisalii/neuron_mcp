import { createTtEldClient, TtEldError } from '../client'

const credentials = { usdot: '123456', apiKey: 'api-secret', providerToken: 'provider-secret' }
const mockFetch = jest.fn()
global.fetch = mockFetch

function response(body: unknown, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => String(Buffer.byteLength(text)) },
    text: async () => text,
  })
}

beforeEach(() => { jest.clearAllMocks(); delete process.env.FIVE_ELD_MAX_PAGES; delete process.env.TTELD_MAX_PAGES })

it('sends both server-side auth headers and parses realtime units', async () => {
  mockFetch.mockImplementation(() => response({ units: [{ truck_number: '554322', vin: 'VIN1', coordinates: { lat: 31.9, lng: -102.0 }, timestamp: '2026-04-09T02:42:00Z' }] }))
  const units = await createTtEldClient(credentials).getRealtimeUnitsByUsdot()
  expect(units[0]?.truck_number).toBe('554322')
  const options = mockFetch.mock.calls[0]?.[1] as RequestInit
  expect(options.headers).toEqual(expect.objectContaining({ 'x-api-key': 'api-secret', 'provider-token': 'provider-secret' }))
})

it('omits provider-token when the workspace does not require one', async () => {
  mockFetch.mockImplementation(() => response({ units: [] }))
  await createTtEldClient({ companyId: '1489081', usdot: '123456', apiKey: 'api-secret' }).getRealtimeUnitsByUsdot()
  const headers = (mockFetch.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
  expect(headers['x-api-key']).toBe('api-secret')
  expect(headers['provider-token']).toBeUndefined()
})

it('parses tracking by VIN', async () => {
  mockFetch.mockImplementation(() => response({ unit: { truck_number: '12', vin: 'VIN1', id: 293, coordinates: { lat: 1, lng: 2 }, timestamp: '2026-01-01T00:00:00Z', speed: 10, rotation: 248, odometer: 493458 } }))
  expect((await createTtEldClient(credentials).getTrackingByVin('VIN1')).speed).toBe(10)
})

it.each([
  ['getDrivers', { id: 'd1', first_name: 'John', second_name: 'Smith' }],
  ['getCurrentUnits', { id: 'u1', vin: 'VIN1', truck_number: '12', driver: null, codriver: null }],
] as const)('paginates %s', async (method, item) => {
  mockFetch
    .mockImplementationOnce(() => response({ data: [item], meta: { page: 1, perPage: 100, total: 2, totalPages: 2 } }))
    .mockImplementationOnce(() => response({ data: [{ ...item, id: `${item.id}b` }], meta: { page: 2, perPage: 100, total: 2, totalPages: 2 } }))
  const result = await createTtEldClient(credentials)[method]({ isActive: true })
  expect(result).toHaveLength(2)
  expect(String(mockFetch.mock.calls[1]?.[0])).toContain('page=2')
})

it('rejects invalid JSON without logging credentials', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockFetch.mockImplementation(() => response('not-json'))
  await expect(createTtEldClient(credentials).getRealtimeUnitsByUsdot()).rejects.toMatchObject({ code: 'invalid_response' })
  expect(log).not.toHaveBeenCalled()
  log.mockRestore()
})

it('does not retry authorization failures', async () => {
  mockFetch.mockImplementation(() => response({}, 401))
  await expect(createTtEldClient(credentials).getRealtimeUnitsByUsdot()).rejects.toMatchObject({ code: 'unauthorized' })
  expect(mockFetch).toHaveBeenCalledTimes(1)
})

it('classifies a safe provider-token-required message without retaining the body', async () => {
  mockFetch.mockImplementation(() => response({ message: 'Provider token is required' }, 400))
  await expect(createTtEldClient({ companyId: '1', usdot: '123456', apiKey: 'api-secret' }).getRealtimeUnitsByUsdot()).rejects.toMatchObject({ code: 'provider_error', status: 400, detailsSafe: { providerTokenRequired: true, responseTopLevelKeys: ['message'] } })
})

it('enforces the 72-hour active-units window', async () => {
  const client = createTtEldClient(credentials)
  await expect(client.getActiveUnits({ from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-04T00:00:01Z') })).rejects.toBeInstanceOf(TtEldError)
  expect(mockFetch).not.toHaveBeenCalled()
})
