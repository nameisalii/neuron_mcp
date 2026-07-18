import { render, screen } from '@testing-library/react'
import TtEldLiveFleetPage from '../page'

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ units: [{ truckNumber: '554322', driver: 'John Smith', vin: 'VIN1', coordinates: { lat: 31.98, lng: -102.03 }, speed: 10, rotation: 248, timestamp: '2026-04-09T02:42:00Z', stale: false }] }) }) as jest.Mock
})

it('renders the live fleet table without credentials', async () => {
  render(<TtEldLiveFleetPage />)
  expect(await screen.findByText('554322')).toBeInTheDocument()
  expect(screen.getByText('John Smith')).toBeInTheDocument()
  expect(screen.getByText('Fresh')).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/x-api-key|provider-token/)
})
