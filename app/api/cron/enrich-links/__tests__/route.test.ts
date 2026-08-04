/** @jest-environment node */

import { GET } from '../route'
import { runLinkEnrichment } from '@/lib/enrich/job'

jest.mock('@/lib/enrich/job', () => ({ runLinkEnrichment: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'cron-secret'
  process.env.FIRECRAWL_ENABLED = 'true'
  jest.mocked(runLinkEnrichment).mockResolvedValue({
    itemsScanned: 1,
    parentsCurrent: 0,
    linksFound: 1,
    cacheHits: 0,
    crawlsAttempted: 1,
    successes: 1,
    authWalls: 0,
    ssrfBlocked: 0,
    failures: 0,
    childrenCreated: 1,
    budgetExhausted: false,
  })
})

it('rejects an invalid cron secret', async () => {
  const response = await GET(new Request('http://localhost/api/cron/enrich-links', {
    headers: { 'x-cron-secret': 'wrong' },
  }))
  expect(response.status).toBe(401)
})

it('returns only the safe run summary', async () => {
  const response = await GET(new Request('http://localhost/api/cron/enrich-links', {
    headers: { authorization: 'Bearer cron-secret' },
  }))
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual(expect.objectContaining({
    itemsScanned: 1,
    crawlsAttempted: 1,
    successes: 1,
  }))
})
