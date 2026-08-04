import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { CACHE_TTL_DAYS, firecrawlConfigured, MAX_CRAWLS_PER_RUN } from './constants'
import { createLinkedKnowledge } from './createLinkedKnowledge'
import { resolveLinks } from './resolveLinks'

export interface LinkEnrichmentSummary {
  itemsScanned: number
  parentsCurrent: number
  linksFound: number
  cacheHits: number
  crawlsAttempted: number
  successes: number
  authWalls: number
  ssrfBlocked: number
  failures: number
  childrenCreated: number
  budgetExhausted: boolean
  disabled?: boolean
}

function metadataRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function scanCurrent(metadata: Record<string, unknown>, now: Date): boolean {
  const scan = metadata.linkEnrichment
  if (!scan || typeof scan !== 'object' || Array.isArray(scan)) return false
  const scannedAt = typeof (scan as Record<string, unknown>).scannedAt === 'string'
    ? new Date((scan as Record<string, unknown>).scannedAt as string)
    : null
  return Boolean(
    scannedAt &&
    !Number.isNaN(scannedAt.getTime()) &&
    now.getTime() - scannedAt.getTime() < CACHE_TTL_DAYS * 86_400_000,
  )
}

export async function runLinkEnrichment(options: {
  maxCrawls?: number
  scanLimit?: number
  now?: Date
  force?: boolean
} = {}): Promise<LinkEnrichmentSummary> {
  const summary: LinkEnrichmentSummary = {
    itemsScanned: 0,
    parentsCurrent: 0,
    linksFound: 0,
    cacheHits: 0,
    crawlsAttempted: 0,
    successes: 0,
    authWalls: 0,
    ssrfBlocked: 0,
    failures: 0,
    childrenCreated: 0,
    budgetExhausted: false,
  }
  if (!options.force && !firecrawlConfigured()) return { ...summary, disabled: true }

  const now = options.now ?? new Date()
  const maxCrawls = Math.max(0, Math.min(options.maxCrawls ?? MAX_CRAWLS_PER_RUN, MAX_CRAWLS_PER_RUN))
  const scanLimit = Math.max(1, Math.min(options.scanLimit ?? maxCrawls * 10, 1_000))
  const parents = await prisma.knowledgeItem.findMany({
    where: { source: { not: 'linked_page' } },
    orderBy: { createdAt: 'desc' },
    take: scanLimit,
    select: {
      id: true,
      workspaceId: true,
      content: true,
      summary: true,
      label: true,
      source: true,
      sourceExternalId: true,
      sourceMetadata: true,
      visibility: true,
      visibilitySetBy: true,
      verified: true,
      owner: true,
      sourceCreatedAt: true,
    },
  })
  summary.itemsScanned = parents.length

  const workspaceSummaries = new Map<string, { successes: number; failures: number }>()
  for (const parent of parents) {
    const sourceMetadata = metadataRecord(parent.sourceMetadata)
    if (scanCurrent(sourceMetadata, now)) {
      summary.parentsCurrent++
      continue
    }
    const remaining = maxCrawls - summary.crawlsAttempted
    if (remaining <= 0) {
      summary.budgetExhausted = true
      break
    }

    const resolved = await resolveLinks({ item: parent, now, maxCrawls: remaining })
    summary.linksFound += resolved.length
    summary.cacheHits += resolved.filter((link) => link.metadata.cacheHit).length
    summary.crawlsAttempted += resolved.filter((link) => link.metadata.crawlAttempted).length
    summary.successes += resolved.filter((link) => ['success', 'cache_hit', 'too_large'].includes(link.status) && Boolean(link.markdown)).length
    summary.authWalls += resolved.filter((link) => link.status === 'auth_wall').length
    summary.ssrfBlocked += resolved.filter((link) => link.status === 'ssrf_blocked').length
    summary.failures += resolved.filter((link) => link.status === 'firecrawl_error').length

    const successful = resolved.filter((link) => ['success', 'cache_hit', 'too_large'].includes(link.status) && Boolean(link.markdown))
    if (successful.length > 0) {
      const children = await createLinkedKnowledge({ parent, resolved: successful })
      summary.childrenCreated += children.filter((child) => child.created).length
    }

    const skippedCount = resolved.length - successful.length
    await prisma.knowledgeItem.update({
      where: { id: parent.id },
      data: {
        sourceMetadata: {
          ...sourceMetadata,
          linkEnrichment: {
            scannedAt: now.toISOString(),
            linkCount: resolved.length,
            successCount: successful.length,
            skippedCount,
            cacheHitCount: resolved.filter((link) => link.metadata.cacheHit).length,
            status: 'complete',
          },
        } satisfies Prisma.InputJsonValue,
      },
    })
    const workspaceSummary = workspaceSummaries.get(parent.workspaceId) ?? { successes: 0, failures: 0 }
    workspaceSummary.successes += successful.length
    workspaceSummary.failures += skippedCount
    workspaceSummaries.set(parent.workspaceId, workspaceSummary)
  }
  if (summary.crawlsAttempted >= maxCrawls) summary.budgetExhausted = true

  for (const [workspaceId, counts] of workspaceSummaries) {
    try {
      await prisma.activityEvent.create({
        data: {
          workspaceId,
          userId: 'system',
          displayName: 'Neuron',
          eventType: 'link_enrichment',
          description: `Enriched ${counts.successes} linked page${counts.successes === 1 ? '' : 's'}.`,
          metadata: counts,
        },
        select: { id: true },
      })
    } catch {
      console.error('[link-enrichment] activity write failed', { errorCode: 'ACTIVITY_WRITE_FAILED' })
    }
  }
  return summary
}
