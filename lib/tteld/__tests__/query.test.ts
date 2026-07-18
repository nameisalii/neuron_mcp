import { getFleetStatusSummary, getLatestLocationForDriver, getLatestLocationForTruck } from '../query'

function client(timestamp = new Date().toISOString()) {
  return {
    getCurrentUnits: jest.fn().mockResolvedValue([{ id: 'u1', truck_number: '554322', vin: 'VIN1', driver: { id: 'd1', first_name: 'John', second_name: 'Smith' }, codriver: null }]),
    getRealtimeUnitsByUsdot: jest.fn().mockResolvedValue([{ truck_number: '554322', vin: 'VIN1', coordinates: { lat: 31.98, lng: -102.03 }, timestamp }]),
    getTrackingByVin: jest.fn().mockResolvedValue({ id: 1, truck_number: '554322', vin: 'VIN1', coordinates: { lat: 31.98, lng: -102.03 }, timestamp, speed: 10, rotation: 248, odometer: 493458 }),
  } as any
}

it('uses live VIN tracking for a truck location without hallucinating an address', async () => {
  const api = client(); const result = await getLatestLocationForTruck(api, 'where is truck 554322 right now?')
  expect(api.getTrackingByVin).toHaveBeenCalledWith('VIN1'); expect(result?.answer).toContain('31.980000, -102.030000'); expect(result?.answer).toContain('returned coordinates but no street address'); expect(result?.sources[0]?.pageTitle).toBe('Live Five ELD API')
})
it('maps a driver to the assigned truck and returns live location', async () => {
  const api = client(); const result = await getLatestLocationForDriver(api, 'where is driver John?')
  expect(result?.answer).toContain('Driver: John Smith'); expect(api.getTrackingByVin).toHaveBeenCalledWith('VIN1')
})
it('warns when the GPS timestamp is stale', async () => { expect((await getLatestLocationForTruck(client('2020-01-01T00:00:00Z'), 'truck 554322 location'))?.answer).toContain('This GPS point is stale.') })
it('returns a live fleet summary', async () => { const result = await getFleetStatusSummary(client()); expect(result.answer).toContain('Trucks currently moving: 1'); expect(result.sources[0]?.sourceMetadata?.live).toBe(true) })
