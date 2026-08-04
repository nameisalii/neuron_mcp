/** @jest-environment node */

import { prisma } from '@/lib/db'
import { scrapeUrl } from '@/lib/firecrawl/client'
import { resolveLinks } from '../resolveLinks'

jest.mock('@/lib/db', () => ({
  prisma: {
    crawledPage: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}))

jest.mock('@/lib/firecrawl/client', () => ({
  scrapeUrl: jest.fn(),
}))

// Keep these unit tests deterministic and offline. Literal private addresses are
// still rejected by the guard before DNS resolution.
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}))

const mockFindCache = jest.mocked(prisma.crawledPage.findUnique)
const mockUpsertCache = jest.mocked(prisma.crawledPage.upsert)
const mockScrape = jest.mocked(scrapeUrl)

const NOW = new Date('2026-07-28T12:00:00.000Z')
const parent = {
  id: 'parent-1',
  workspaceId: 'workspace-1',
  content: 'Here is the spec: https://example.com/spec',
  summary: null,
  label: null,
  source: 'slack',
  sourceExternalId: 'message-1',
  sourceMetadata: { channelName: '#eng-decisions' },
  visibility: 'team',
  visibilitySetBy: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFindCache.mockResolvedValue(null)
  mockUpsertCache.mockResolvedValue({ id: 'cache-1' } as never)
  mockScrape.mockResolvedValue({
    ok: true,
    url: 'https://example.com/spec',
    finalUrl: 'https://example.com/spec',
    title: 'Product specification',
    markdown: '# Product specification\n\nThe launch requires approval.',
    statusCode: 200,
  })
})

it('resolves a public HTTPS link without mutating the parent', async () => {
  const original = structuredClone(parent)

  const [result] = await resolveLinks({ item: parent, now: NOW })

  expect(result).toEqual(expect.objectContaining({
    status: 'success',
    markdown: expect.stringContaining('launch requires approval'),
    sourceUrl: 'https://example.com/spec',
    parentKnowledgeItemId: 'parent-1',
  }))
  expect(parent).toEqual(original)
})

it.each([
  'http://10.0.1.5:8080',
  'http://127.0.0.1',
  'http://localhost:3000',
  'http://169.254.169.254/latest/meta-data',
  'http://192.168.1.10',
  'http://172.16.0.1',
  'http://[::1]',
  'https://127.0.0.1',
  'https://10.0.0.1',
  'https://[::1]',
  'https://[fc00::1]',
  'https://[fe80::1]',
])('blocks private or local address %s before Firecrawl', async (url) => {
  const results = await resolveLinks({ item: { ...parent, content: `See ${url}` }, now: NOW })

  expect(results[0]).toEqual(expect.objectContaining({ status: 'ssrf_blocked' }))
  expect(mockScrape).not.toHaveBeenCalled()
})

it.each([
  'http://example.com',
  'javascript:alert(1)',
  'file:///etc/passwd',
  'ftp://example.com/file',
])('rejects unsupported or non-HTTPS URL %s', async (url) => {
  const results = await resolveLinks({ item: { ...parent, content: `See ${url}` }, now: NOW })

  if (url.startsWith('http:')) {
    expect(results[0]).toEqual(expect.objectContaining({ status: 'ssrf_blocked' }))
  } else {
    expect(results).toHaveLength(0)
  }
  expect(mockScrape).not.toHaveBeenCalled()
})

it.each([
  { statusCode: 401, title: 'Unauthorized', markdown: '' },
  { statusCode: 403, title: 'Forbidden', markdown: '' },
  { statusCode: 200, title: 'Sign in', markdown: 'Sign in to continue to Google Docs.' },
])('skips auth-walled pages cleanly', async ({ statusCode, title, markdown }) => {
  mockScrape.mockResolvedValue({
    ok: statusCode === 200,
    url: 'https://example.com/spec',
    title,
    markdown,
    statusCode,
    errorCode: statusCode === 200 ? undefined : 'http_error',
  })

  const [result] = await resolveLinks({ item: parent, now: NOW })

  expect(result.status).toBe('auth_wall')
  expect(result.markdown).toBeUndefined()
  expect(mockUpsertCache).toHaveBeenCalledWith(expect.objectContaining({
    create: expect.objectContaining({ status: 'auth_wall', content: null }),
  }))
})

it('serves a duplicate URL from fresh cache without another Firecrawl call', async () => {
  mockFindCache.mockResolvedValue({
    id: 'cache-1',
    url: 'https://example.com/spec',
    normalizedUrl: 'https://example.com/spec',
    title: 'Cached specification',
    content: 'Cached markdown',
    fetchedAt: new Date('2026-07-27T12:00:00.000Z'),
    status: 'success',
    httpStatus: 200,
    contentHash: null,
    errorCode: null,
    metadata: null,
    createdAt: NOW,
    updatedAt: NOW,
  } as never)

  const [result] = await resolveLinks({
    item: { ...parent, content: 'https://example.com/spec and https://example.com/spec' },
    now: NOW,
  })

  expect(result.status).toBe('cache_hit')
  expect(result.markdown).toBe('Cached markdown')
  expect(result.metadata.cacheHit).toBe(true)
  expect(mockScrape).not.toHaveBeenCalled()
})

it.each([
  { statusCode: 500, errorCode: 'http_500' },
  { statusCode: 503, errorCode: 'http_503' },
  { statusCode: undefined, errorCode: 'timeout' },
])('isolates Firecrawl failures from parent extraction', async ({ statusCode, errorCode }) => {
  mockScrape.mockResolvedValue({
    ok: false,
    url: 'https://example.com/spec',
    statusCode,
    errorCode,
    errorMessage: 'Firecrawl unavailable',
  })

  await expect(resolveLinks({ item: parent, now: NOW })).resolves.toEqual([
    expect.objectContaining({ status: 'firecrawl_error' }),
  ])
})

it('reports redirect-cap failures without returning content', async () => {
  mockScrape.mockResolvedValue({
    ok: false,
    url: 'https://example.com/spec',
    errorCode: 'too_many_redirects',
  })

  const [result] = await resolveLinks({ item: parent, now: NOW })

  expect(result).toEqual(expect.objectContaining({
    status: 'skipped',
    metadata: expect.objectContaining({ firecrawlStatus: 'too_many_redirects' }),
  }))
  expect(result.markdown).toBeUndefined()
})

it('caps oversized markdown', async () => {
  mockScrape.mockResolvedValue({
    ok: true,
    url: 'https://example.com/spec',
    finalUrl: 'https://example.com/spec',
    markdown: 'x'.repeat(100),
    statusCode: 200,
  })

  const [result] = await resolveLinks({ item: parent, now: NOW, maxContentChars: 20 })

  expect(result.status).toBe('too_large')
  expect(result.markdown).toHaveLength(20)
})

it('inherits personal visibility and records honest parent provenance', async () => {
  const [result] = await resolveLinks({
    item: {
      ...parent,
      visibility: 'personal',
      visibilitySetBy: 'user-x',
      source: 'telegram',
      sourceExternalId: 'telegram-message-9',
    },
    now: NOW,
  })

  expect(result).toEqual(expect.objectContaining({
    sourceUrl: 'https://example.com/spec',
    parentKnowledgeItemId: 'parent-1',
    visibility: 'personal',
    visibilitySetBy: 'user-x',
    metadata: expect.objectContaining({
      parentSource: 'telegram',
      parentSourceExternalId: 'telegram-message-9',
      cacheHit: false,
    }),
  }))
})
