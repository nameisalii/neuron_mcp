function positiveInteger(name: string, fallback: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

export const MAX_LINKS_PER_ITEM = positiveInteger('FIRECRAWL_MAX_LINKS_PER_ITEM', 5, 20)
export const MAX_CRAWLS_PER_RUN = positiveInteger('FIRECRAWL_MAX_CRAWLS_PER_RUN', 25, 250)
export const MAX_CONTENT_CHARS = positiveInteger('FIRECRAWL_MAX_CONTENT_CHARS', 20_000, 100_000)
export const CACHE_TTL_DAYS = positiveInteger('FIRECRAWL_CACHE_TTL_DAYS', 30, 365)
export const REQUEST_TIMEOUT_MS = positiveInteger('FIRECRAWL_REQUEST_TIMEOUT_MS', 20_000, 60_000)
export const MAX_REDIRECTS = 3

export function firecrawlEnabled(): boolean {
  return (process.env.FIRECRAWL_ENABLED ?? process.env.FIRECRAWL_ENABLE) === 'true'
}

export function firecrawlConfigured(): boolean {
  return firecrawlEnabled() && Boolean(process.env.FIRECRAWL_API_KEY?.trim())
}

export function firecrawlSafeDebug(): boolean {
  return process.env.FIRECRAWL_DEBUG_SAFE === 'true'
}
