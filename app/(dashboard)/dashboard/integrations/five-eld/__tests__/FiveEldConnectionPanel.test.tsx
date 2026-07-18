import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import FiveEldConnectionPanel from '../FiveEldConnectionPanel'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

beforeEach(() => { global.fetch = jest.fn(); jest.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => jest.restoreAllMocks())

it('renders the setup guide and keeps secrets in password fields', () => {
  render(<FiveEldConnectionPanel connected={false} />)
  expect(screen.getByText('How to get your Five ELD API credentials')).toBeInTheDocument()
  expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password')
  expect(screen.getByLabelText('Provider token')).toHaveAttribute('type', 'password')
  expect(screen.getByText('(optional)')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save connection' })).toBeDisabled()
})

it('enables save only after a successful test', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
  render(<FiveEldConnectionPanel connected={false} />)
  fireEvent.change(screen.getByLabelText('Company ID'), { target: { value: '1489081' } })
  fireEvent.change(screen.getByLabelText('USDOT number'), { target: { value: '1234567' } })
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'secret' } })
  expect(screen.getByRole('button', { name: 'Save connection' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save connection' })).toBeEnabled())
  const [path, options] = jest.mocked(global.fetch).mock.calls[0]!
  expect(path).toBe('/api/integrations/five-eld/test')
  expect(JSON.parse(String(options?.body))).toEqual({ companyId: '1489081', usdot: '1234567', apiKey: 'secret', providerToken: '' })
})

it('displays the backend validation message', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 400, json: async () => ({ ok: false, code: 'validation_error', message: 'Please fill in Company ID, USDOT, and API key.' }) } as Response)
  render(<FiveEldConnectionPanel connected={false} />)
  fireEvent.change(screen.getByLabelText('Company ID'), { target: { value: '1489081' } })
  fireEvent.change(screen.getByLabelText('USDOT number'), { target: { value: '4444355' } })
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'secret' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  expect(await screen.findByText('Please fill in Company ID, USDOT, and API key.')).toBeInTheDocument()
})

it('renders a 422 backend message and safe technical details', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 422, json: async () => ({ ok: false, code: 'missing_provider_token_or_invalid_api_key', stage: 'realtime_units', upstreamStatus: 401, message: 'Five ELD rejected the API key or requires a provider token.', detailsSafe: { endpointPath: '/api/v2/units-by-usdot/:usdot', authModeTried: 'x-api-key', apiKeyPresent: true, providerTokenPresent: false, usdotPresent: true, companyIdPresent: true, responseContentType: 'application/json', responseTopLevelKeys: ['error'] } }) } as Response)
  render(<FiveEldConnectionPanel connected={false} />)
  fireEvent.change(screen.getByLabelText('Company ID'), { target: { value: '1489081' } })
  fireEvent.change(screen.getByLabelText('USDOT number'), { target: { value: '4444355' } })
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'not-rendered-secret' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  expect(await screen.findByText('Five ELD rejected the API key or requires a provider token.')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Technical details'))
  expect(screen.getByText('realtime_units')).toBeInTheDocument()
  expect(screen.getByText('/api/v2/units-by-usdot/:usdot')).toBeInTheDocument()
  expect(screen.getByText('application/json')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Copy support message' })).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('not-rendered-secret')
})

it('uses the generic fallback only when the backend has no message', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 422, json: async () => ({ ok: false }) } as Response)
  render(<FiveEldConnectionPanel connected={false} />)
  fireEvent.change(screen.getByLabelText('Company ID'), { target: { value: '1489081' } })
  fireEvent.change(screen.getByLabelText('USDOT number'), { target: { value: '4444355' } })
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'secret' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  expect(await screen.findByText('Neuron could not connect to Five ELD. Please check your credentials and try again.')).toBeInTheDocument()
})

it('asks for confirmation before disconnecting', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ units: [] }) } as Response)
  render(<FiveEldConnectionPanel connected />)
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  expect(window.confirm).toHaveBeenCalled()
})
