import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { createTtEldClient, type TtEldCredentials } from './client'
import { normalizeActiveUnit, normalizeCurrentUnit, normalizeDriver, normalizeRealtimeUnit, type TtEldModule, type TtEldNormalizedItem } from './normalize'

export interface TtEldSyncResult {
  ok: boolean; fetched: number; created: number; updated: number; skipped: number; embeddingErrors: number
  counts: Record<TtEldModule, number>; failedModules: TtEldModule[]
}

function hash(item: TtEldNormalizedItem): string {
  return `fiveeld:${crypto.createHash('sha256').update(`${item.externalId}\n${item.content}`).digest('hex')}`
}

export async function upsertTtEldKnowledge(workspaceId: string, item: TtEldNormalizedItem, counters: Pick<TtEldSyncResult, 'created' | 'updated' | 'skipped' | 'embeddingErrors'>) {
  const contentHash = hash(item)
  const existing = await prisma.knowledgeItem.findFirst({
    where: { workspaceId, source: 'five_eld', sourceExternalId: item.externalId },
    select: { id: true, contentHash: true, typeOverriddenByUser: true },
  })
  if (existing?.contentHash === contentHash) { counters.skipped++; return }
  if (existing) {
    await prisma.knowledgeItem.update({ where: { id: existing.id }, data: {
      content: item.content, contentHash, sourceMetadata: item.metadata as Prisma.InputJsonValue,
      owner: item.owner, sourceCreatedAt: item.sourceCreatedAt,
      ...(existing.typeOverriddenByUser ? {} : { category: item.category }),
    } })
    counters.updated++
    return
  }
  const created = await prisma.knowledgeItem.create({ data: {
    workspaceId, source: 'five_eld', sourceExternalId: item.externalId, content: item.content, contentHash,
    category: item.category, aiSuggestedCategory: item.category, sourceMetadata: item.metadata as Prisma.InputJsonValue,
    owner: item.owner, sourceCreatedAt: item.sourceCreatedAt, visibility: 'team', confidence: 0.95,
  }, select: { id: true } })
  counters.created++
  try {
    const embedding = await generateEmbedding(item.content)
    await upsertEmbedding(created.id, embedding, { workspaceId, source: 'five_eld', category: item.category })
    await prisma.knowledgeItem.update({ where: { id: created.id }, data: { embeddingId: created.id } })
  } catch { counters.embeddingErrors++ }
}

export async function syncTtEldKnowledge(workspaceId: string, credentials: TtEldCredentials): Promise<TtEldSyncResult> {
  const client = createTtEldClient(credentials)
  const result: TtEldSyncResult = {
    ok: false, fetched: 0, created: 0, updated: 0, skipped: 0, embeddingErrors: 0,
    counts: { realtime_units: 0, current_units: 0, drivers: 0, active_units_72h: 0 }, failedModules: [],
  }
  const now = new Date()
  const from = new Date(now.getTime() - 72 * 60 * 60 * 1000)
  const bucket = `${from.toISOString().slice(0, 10)}_${now.toISOString().slice(0, 10)}`
  const modules: Array<{ key: TtEldModule; load: () => Promise<TtEldNormalizedItem[]> }> = [
    { key: 'realtime_units', load: async () => (await client.getRealtimeUnitsByUsdot()).map((item) => normalizeRealtimeUnit(item, now)) },
    { key: 'current_units', load: async () => (await client.getCurrentUnits({ isActive: true })).map(normalizeCurrentUnit) },
    { key: 'drivers', load: async () => (await client.getDrivers({ isActive: true })).map(normalizeDriver) },
    { key: 'active_units_72h', load: async () => (await client.getActiveUnits({ from, to: now })).map((item) => normalizeActiveUnit(item, bucket)) },
  ]
  for (const module of modules) {
    try {
      const items = await module.load()
      result.counts[module.key] = items.length
      result.fetched += items.length
      for (const item of items) await upsertTtEldKnowledge(workspaceId, item, result)
    } catch { result.failedModules.push(module.key) }
  }
  result.ok = result.failedModules.length < modules.length
  return result
}
