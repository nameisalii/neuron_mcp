import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { scrapeUrl } from '@/lib/firecrawl/client'
import { isAuthWall } from './authWall'
import { CACHE_TTL_DAYS, firecrawlSafeDebug, MAX_CONTENT_CHARS, MAX_LINKS_PER_ITEM } from './constants'
import { checkSafeUrl } from './ssrfGuard'
import { dedupeUrls, extractUrls, normalizeUrl } from './urls'

export interface KnowledgeItemLike {
  id: string
  workspaceId: string
  content: string
  summary?: string | null
  label?: string | null
  source: string
  sourceExternalId?: string | null
  sourceMetadata?: unknown
  visibility: string
  visibilitySetBy?: string | null
}

export type ResolvedLinkStatus =
  | 'success'
  | 'cache_hit'
  | 'auth_wall'
  | 'ssrf_blocked'
  | 'firecrawl_error'
  | 'too_large'
  | 'skipped'

export interface ResolvedLinkResult {
  url: string
  normalizedUrl: string
  status: ResolvedLinkStatus
  title?: string
  markdown?: string
  fetchedAt?: Date
  sourceUrl: string
  parentKnowledgeItemId: string
  visibility: string
  visibilitySetBy: string | null
  metadata: {
    parentWorkspaceId: string
    parentSource: string
    parentSourceExternalId?: string
    firecrawlStatus?: string
    cacheHit: boolean
    crawlAttempted?: boolean
  }
}

interface ResolveLinksInput {
  item: KnowledgeItemLike
  maxLinksPerItem?: number
  maxContentChars?: number
  maxCrawls?: number
  now?: Date
}

function parentMetadata(item: KnowledgeItemLike, firecrawlStatus: string, cacheHit: boolean, crawlAttempted = false) {
  return {
    parentWorkspaceId: item.workspaceId,
    parentSource: item.source,
    ...(item.sourceExternalId ? { parentSourceExternalId: item.sourceExternalId } : {}),
    firecrawlStatus,
    cacheHit,
    crawlAttempted,
  }
}

function baseResult(item: KnowledgeItemLike, url: string, normalizedUrl: string) {
  return {
    url,
    normalizedUrl,
    sourceUrl: normalizedUrl,
    parentKnowledgeItemId: item.id,
    visibility: item.visibility,
    visibilitySetBy: item.visibilitySetBy ?? null,
  }
}

function metadataText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function hasSensitiveQuery(url: string): boolean {
  const keys = [...new URL(url).searchParams.keys()]
  return keys.some((key) => /(^|[-_])(token|key|signature|sig|auth|password|secret|expires?|x-amz)([-_]|$)/i.test(key))
}

function fresh(fetchedAt: Date, now: Date): boolean {
  return now.getTime() - fetchedAt.getTime() <= CACHE_TTL_DAYS * 86_400_000
}

function safeDebug(url: string, status: string, cacheHit: boolean, contentLength = 0) {
  if (!firecrawlSafeDebug()) return
  let domain = 'invalid'
  try {
    domain = new URL(url).hostname
  } catch {
    // no-op
  }
  console.info('[firecrawl]', { domain, status, cacheHit, contentLength })
}

export async function resolveLinks(input: ResolveLinksInput): Promise<ResolvedLinkResult[]> {
  const item = input.item
  const now = input.now ?? new Date()
  const maxLinks = Math.max(0, Math.min(input.maxLinksPerItem ?? MAX_LINKS_PER_ITEM, MAX_LINKS_PER_ITEM))
  const maxContentChars = Math.max(1, Math.min(input.maxContentChars ?? MAX_CONTENT_CHARS, MAX_CONTENT_CHARS))
  const candidates = dedupeUrls([
    ...extractUrls(item.content),
    ...extractUrls(item.summary ?? ''),
    ...extractUrls(item.label ?? ''),
    ...extractUrls(metadataText(item.sourceMetadata)),
  ]).slice(0, maxLinks)

  const results: ResolvedLinkResult[] = []
  let crawlsAttempted = 0
  for (const url of candidates) {
    const normalizedUrl = normalizeUrl(url)
    const base = baseResult(item, url, normalizedUrl)
    const guard = await checkSafeUrl(normalizedUrl)
    if (!guard.safe) {
      results.push({
        ...base,
        status: 'ssrf_blocked',
        metadata: parentMetadata(item, guard.reason, false),
      })
      safeDebug(normalizedUrl, 'ssrf_blocked', false)
      continue
    }
    if (hasSensitiveQuery(guard.url)) {
      results.push({
        ...base,
        status: 'skipped',
        metadata: parentMetadata(item, 'sensitive_query', false),
      })
      safeDebug(normalizedUrl, 'sensitive_query', false)
      continue
    }

    const cached = await prisma.crawledPage.findUnique({ where: { normalizedUrl } })
    if (cached && fresh(cached.fetchedAt, now)) {
      const cachedStatus: ResolvedLinkStatus = cached.status === 'success'
        ? 'cache_hit'
        : cached.status === 'auth_wall'
          ? 'auth_wall'
          : cached.status === 'ssrf_blocked'
            ? 'ssrf_blocked'
            : cached.status === 'too_large'
              ? 'too_large'
              : 'skipped'
      results.push({
        ...base,
        status: cachedStatus,
        ...(cached.title ? { title: cached.title } : {}),
        ...(cached.content && cachedStatus !== 'auth_wall' ? { markdown: cached.content } : {}),
        fetchedAt: cached.fetchedAt,
        metadata: parentMetadata(item, cached.status, true),
      })
      safeDebug(normalizedUrl, cachedStatus, true, cached.content?.length ?? 0)
      continue
    }

    if (crawlsAttempted >= (input.maxCrawls ?? Number.POSITIVE_INFINITY)) {
      results.push({
        ...base,
        status: 'skipped',
        metadata: parentMetadata(item, 'budget_exhausted', false),
      })
      continue
    }

    crawlsAttempted++
    const scraped = await scrapeUrl(guard.url)
    const finalUrl = scraped.finalUrl ? normalizeUrl(scraped.finalUrl) : normalizedUrl
    const finalGuard = await checkSafeUrl(finalUrl)
    if (!finalGuard.safe || scraped.errorCode === 'ssrf_blocked') {
      results.push({
        ...base,
        status: 'ssrf_blocked',
        metadata: parentMetadata(item, 'ssrf_blocked', false, true),
      })
      continue
    }

    const authWall = isAuthWall(scraped)
    const redirectCapped = scraped.errorCode === 'too_many_redirects'
    const rawMarkdown = scraped.markdown?.trim() ?? ''
    const oversized = rawMarkdown.length > maxContentChars
    const content = rawMarkdown ? rawMarkdown.slice(0, maxContentChars) : null
    const status = authWall
      ? 'auth_wall'
      : redirectCapped
        ? 'skipped'
        : !scraped.ok
          ? 'firecrawl_error'
          : oversized
            ? 'too_large'
            : content
              ? 'success'
              : 'skipped'
    const cacheStatus = status
    const contentHash = content ? createHash('sha256').update(content).digest('hex') : null

    await prisma.crawledPage.upsert({
      where: { normalizedUrl },
      create: {
        url: normalizedUrl,
        normalizedUrl,
        title: scraped.title ?? null,
        content: authWall ? null : content,
        fetchedAt: now,
        status: cacheStatus,
        httpStatus: scraped.statusCode ?? null,
        contentHash,
        errorCode: scraped.errorCode ?? null,
        metadata: {
          finalUrl,
        } satisfies Prisma.InputJsonValue,
      },
      update: {
        url: normalizedUrl,
        title: scraped.title ?? null,
        content: authWall ? null : content,
        fetchedAt: now,
        status: cacheStatus,
        httpStatus: scraped.statusCode ?? null,
        contentHash,
        errorCode: scraped.errorCode ?? null,
        metadata: {
          finalUrl,
        } satisfies Prisma.InputJsonValue,
      },
    })

    results.push({
      ...base,
      sourceUrl: finalUrl,
      status,
      ...(scraped.title ? { title: scraped.title } : {}),
      ...(!authWall && content ? { markdown: content } : {}),
      fetchedAt: now,
      metadata: parentMetadata(item, scraped.errorCode ?? cacheStatus, false, true),
    })
    safeDebug(normalizedUrl, status, false, content?.length ?? 0)
  }
  return results
}
