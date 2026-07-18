/**
 * @jest-environment node
 */
import { getValidDatatruckInternalAccessToken } from '../auth'
import { datatruckInternalRequest } from '../client'

jest.mock('../auth', () => ({
  getValidDatatruckInternalAccessToken: jest.fn(),
}))

const mockGetToken = jest.mocked(getValidDatatruckInternalAccessToken)
const originalFetch = global.fetch

beforeEach(() => {
  jest.clearAllMocks()
  mockGetToken.mockResolvedValue('internal-token')
})

afterEach(() => {
  global.fetch = originalFetch
})

it('adds Bearer auth server-side without exposing the token in a response body', async () => {
  const fetchMock = jest.fn(async () => ({ ok: true, status: 200, text: async () => 'ok' }))
  global.fetch = fetchMock as never

  const res = await datatruckInternalRequest(
    { workspaceId: 'ws-1', companyName: 'sflogistics' },
    '/api/v1/customer/?page=1&page_size=1&filter=[]&ordering=',
  )

  expect(res.status).toBe(200)
  expect(mockGetToken).toHaveBeenCalledWith('ws-1')
  expect(fetchMock).toHaveBeenCalledWith(
    'https://sflogistics.datatruck.io/api/v1/customer/?page=1&page_size=1&filter=[]&ordering=',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer internal-token' }),
    }),
  )
})

it('retries once on 401 and then returns the second response', async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 401 })
    .mockResolvedValueOnce({ ok: true, status: 200 })
  global.fetch = fetchMock as never

  const res = await datatruckInternalRequest(
    { workspaceId: 'ws-1', companyName: 'sflogistics' },
    '/api/v1/invoice/batches/list/?page=1&page_size=1&filter=[]&ordering=',
  )

  expect(res.status).toBe(200)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(mockGetToken).toHaveBeenCalledTimes(2)
})
