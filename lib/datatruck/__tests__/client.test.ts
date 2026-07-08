import {
  DATATRUCK_ENDPOINTS,
  buildDatatruckApiBaseUrl,
  buildDatatruckUrl,
  datatruckAuthHeaders,
  datatruckEndpointUrl,
  getDatatruckEnvConfig,
  isDatatruckEnvConfigured,
  isValidDatatruckCompanyName,
  normalizeDatatruckCompanyName,
  safeDatatruckMetadata,
  fetchDatatruckPaginated,
  syncDatatruckData,
} from '../client'

jest.mock('@/lib/db', () => ({
  prisma: {
    apiConnector: { findUnique: jest.fn() },
  },
}))

const DATATRUCK_ENV_KEYS = [
  'DATATRUCK_COMPANY_NAME',
  'DATATRUCK_API_BASE_URL',
  'DATATRUCK_API_TOKEN',
  'DATATRUCK_API_KEY',
  'DATATRUCK_MAX_PAGES',
  'DATATRUCK_MAX_RECORDS_PER_ENDPOINT',
  'DATRUCK_MAX_PAGES',
  'DATRUCK_MAX_RECORDS_PER_ENDPOINT',
] as const

const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of DATATRUCK_ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of DATATRUCK_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

describe('normalizeDatatruckCompanyName', () => {
  it('keeps a bare company name and lowercases it', () => {
    expect(normalizeDatatruckCompanyName('SFLogistics')).toBe('sflogistics')
  })

  it('trims whitespace and removes inner spaces', () => {
    expect(normalizeDatatruckCompanyName('  sf logistics  ')).toBe('sflogistics')
  })

  it('normalizes a datatruck.io hostname to the company name', () => {
    expect(normalizeDatatruckCompanyName('sflogistics.datatruck.io')).toBe('sflogistics')
  })

  it('normalizes a full URL with protocol and path', () => {
    expect(normalizeDatatruckCompanyName('https://sflogistics.datatruck.io/api/v1/openapi')).toBe('sflogistics')
  })
})

describe('isValidDatatruckCompanyName', () => {
  it('accepts lowercase alphanumeric names with dashes', () => {
    expect(isValidDatatruckCompanyName('sf-logistics2')).toBe(true)
  })

  it('rejects empty and malformed names', () => {
    expect(isValidDatatruckCompanyName('')).toBe(false)
    expect(isValidDatatruckCompanyName('-leading-dash')).toBe(false)
    expect(isValidDatatruckCompanyName('bad name')).toBe(false)
  })
})

describe('buildDatatruckApiBaseUrl', () => {
  it('builds the openapi base URL from the company name', () => {
    expect(buildDatatruckApiBaseUrl('sflogistics')).toBe('https://sflogistics.datatruck.io/api/v1/openapi')
  })
})

describe('Datatruck pagination helpers', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('builds URLs for absolute and relative next links', () => {
    expect(buildDatatruckUrl({ apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi' }, '/orders/?page=2'))
      .toBe('https://sflogistics.datatruck.io/api/v1/openapi/orders/?page=2')
    expect(buildDatatruckUrl({ apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi' }, 'https://other.example/page=2'))
      .toBe('https://other.example/page=2')
  })

  it('fetches all pages until next is null', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('page=2')) {
        return { ok: true, status: 200, json: async () => ({ count: 3, next: null, results: [{ id: 3 }] }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({ count: 3, next: '/orders/?page=2', results: [{ id: 1 }, { id: 2 }] }) } as Response
    }) as never

    const result = await fetchDatatruckPaginated(
      { apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi', apiToken: 'secret' },
      'loads',
    )

    expect(result.pagesFetched).toBe(2)
    expect(result.records).toHaveLength(3)
    expect(result.countFromApi).toBe(3)
    expect(result.nextStoppedReason).toBe('complete')
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://sflogistics.datatruck.io/api/v1/openapi/orders/',
    )
  })

  it('stops at the record cap', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ count: 100, next: '/orders/?page=2', results: Array.from({ length: 50 }, (_, index) => ({ id: index })) }),
    })) as never

    const result = await fetchDatatruckPaginated(
      { apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi', apiToken: 'secret' },
      'loads',
      { maxRecords: 60, maxPages: 10 },
    )

    expect(result.records).toHaveLength(60)
    expect(result.nextStoppedReason).toBe('max_records')
  })

  it('stops at the page cap', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ count: 100, next: '/orders/?page=2', results: [{ id: 1 }] }),
    })) as never

    const result = await fetchDatatruckPaginated(
      { apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi', apiToken: 'secret' },
      'loads',
      { maxPages: 1, maxRecords: 100 },
    )

    expect(result.pagesFetched).toBe(1)
    expect(result.nextStoppedReason).toBe('max_pages')
  })

  it('exposes the Datatruck endpoint URL with sync window query params for date-sensitive endpoints', () => {
    expect(datatruckEndpointUrl({ apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi' }, 'workOrders'))
      .toMatch(/\/work-orders\/\?from_date=\d{4}-\d{2}-\d{2}&to_date=\d{4}-\d{2}-\d{2}$/)
  })
})

describe('safeDatatruckMetadata', () => {
  it('exposes only safe fields and the endpoint map', () => {
    const metadata = safeDatatruckMetadata('sflogistics')
    expect(metadata).toEqual({
      companyName: 'sflogistics',
      apiBaseUrlConfigured: true,
      apiTokenConfigured: true,
      authHeader: 'Authorization',
      authScheme: 'Token',
      endpoints: {
        loads: '/orders/',
        drivers: '/drivers/list/',
        trucks: '/trucks/list/',
        trailers: '/trailers/list/',
        workOrders: '/work-orders/',
        dispatcherBoard: '/orders/dispatcher-board/list/',
      },
    })
    expect(JSON.stringify(metadata)).not.toContain('token-value')
  })
})

describe('env fallback', () => {
  it('does not require Datatruck env vars for app boot', () => {
    expect(isDatatruckEnvConfigured()).toBe(false)
    expect(getDatatruckEnvConfig()).toEqual({ companyName: undefined, apiBaseUrl: undefined, apiToken: undefined })
  })

  it('derives the base URL from DATATRUCK_COMPANY_NAME and accepts token aliases', () => {
    process.env.DATATRUCK_COMPANY_NAME = 'SFLogistics'
    process.env.DATATRUCK_API_TOKEN = 'token-value'

    const config = getDatatruckEnvConfig()
    expect(config.companyName).toBe('sflogistics')
    expect(config.apiBaseUrl).toBe('https://sflogistics.datatruck.io/api/v1/openapi')
    expect(config.apiToken).toBe('token-value')
    expect(isDatatruckEnvConfigured(config)).toBe(true)
  })

  it('prefers an explicit DATATRUCK_API_BASE_URL and supports DATATRUCK_API_KEY', () => {
    process.env.DATATRUCK_API_BASE_URL = 'https://custom.example/api'
    process.env.DATATRUCK_API_KEY = 'legacy-key'

    const config = getDatatruckEnvConfig()
    expect(config.apiBaseUrl).toBe('https://custom.example/api')
    expect(config.apiToken).toBe('legacy-key')
  })

  it('reads the corrected Datatruck pagination env vars and preserves the legacy typo fallback', async () => {
    jest.resetModules()
    process.env.DATATRUCK_MAX_PAGES = '7'
    process.env.DATATRUCK_MAX_RECORDS_PER_ENDPOINT = '77'

    const freshClient = await import('../client')
    let page = 0
    const fetchMock = jest.fn(async () => {
      page += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ id: page }],
          next: page < 20 ? `/orders/?page=${page + 1}` : null,
        }),
      } as Response
    })
    const originalFetch = global.fetch
    global.fetch = fetchMock as never

    try {
      await freshClient.fetchDatatruckPaginated(
        { apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi', apiToken: 'secret-token' },
        'loads',
      )
    } finally {
      global.fetch = originalFetch
    }

    expect(fetchMock).toHaveBeenCalledTimes(7)

    jest.resetModules()
    delete process.env.DATATRUCK_MAX_PAGES
    delete process.env.DATATRUCK_MAX_RECORDS_PER_ENDPOINT
    process.env.DATRUCK_MAX_PAGES = '8'
    process.env.DATRUCK_MAX_RECORDS_PER_ENDPOINT = '88'

    const legacyClient = await import('../client')
    let legacyPage = 0
    const legacyFetchMock = jest.fn(async () => {
      legacyPage += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ id: legacyPage }],
          next: legacyPage < 20 ? `/orders/?page=${legacyPage + 1}` : null,
        }),
      } as Response
    })
    const previousFetch = global.fetch
    global.fetch = legacyFetchMock as never

    try {
      await legacyClient.fetchDatatruckPaginated(
        { apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi', apiToken: 'secret-token' },
        'loads',
      )
    } finally {
      global.fetch = previousFetch
    }

    expect(legacyFetchMock).toHaveBeenCalledTimes(8)
  })
})

describe('syncDatatruckData', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('calls every endpoint with Token auth headers and counts records', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ id: 1 }, { id: 2 }] }),
    })
    global.fetch = fetchMock as never

    const result = await syncDatatruckData({
      apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi',
      apiToken: 'secret-token',
    })

    expect(fetchMock).toHaveBeenCalledTimes(Object.keys(DATATRUCK_ENDPOINTS).length)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sflogistics.datatruck.io/api/v1/openapi/orders/',
      expect.objectContaining({
        headers: { Authorization: 'Token secret-token', 'Content-Type': 'application/json' },
      }),
    )
    // Work orders and dispatcher board require an explicit date range.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/orders\/dispatcher-board\/list\/\?start_date=\d{4}-\d{2}-\d{2}&end_date=\d{4}-\d{2}-\d{2}$/),
      expect.anything(),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/work-orders\/\?from_date=\d{4}-\d{2}-\d{2}&to_date=\d{4}-\d{2}-\d{2}$/),
      expect.anything(),
    )
    expect(result.ok).toBe(true)
    expect(result.fetched).toBe(2 * Object.keys(DATATRUCK_ENDPOINTS).length)
    expect(result.failedEndpoints).toEqual([])
  })

  it('reports failed endpoints without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as never

    const result = await syncDatatruckData({ apiBaseUrl: 'https://x.datatruck.io/api/v1/openapi', apiToken: 'bad' })

    expect(result.ok).toBe(false)
    expect(result.failedEndpoints).toHaveLength(Object.keys(DATATRUCK_ENDPOINTS).length)
  })

  it('handles network errors without throwing', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as never

    const result = await syncDatatruckData({ apiBaseUrl: 'https://x.datatruck.io/api/v1/openapi', apiToken: 't' })

    expect(result.ok).toBe(false)
  })

  it('builds the auth headers per the Datatruck Token scheme', () => {
    expect(datatruckAuthHeaders('abc')).toEqual({
      Authorization: 'Token abc',
      'Content-Type': 'application/json',
    })
  })
})
