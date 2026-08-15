import { prisma } from '@/lib/db'

export type PulseWindow = 'lastVisit' | 'today' | '7d' | '30d'
export async function getPulse(workspaceId: string, window: PulseWindow, lastVisit?: Date) {
  const now = new Date(); const start = window === 'lastVisit' && lastVisit ? lastVisit : window === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(now.getTime() - (window === '30d' ? 30 : 7) * 86_400_000)
  const [changes, contradictions, stale] = await Promise.all([
    prisma.intelligenceChange.findMany({ where: { workspaceId, occurredAt: { gte: start } }, orderBy: [{ significance: 'desc' }, { occurredAt: 'desc' }], take: 20 }),
    prisma.knowledgeContradiction.findMany({ where: { workspaceId, status: 'OPEN', createdAt: { gte: start } }, orderBy: { confidence: 'desc' }, take: 10 }),
    prisma.staleKnowledgeFinding.findMany({ where: { workspaceId, status: 'OPEN', staleScore: { gte: 0.55 } }, orderBy: { staleScore: 'desc' }, take: 10 }),
  ])
  return { since: start, count: changes.length + contradictions.length + stale.length, changes, contradictions, stale, empty: changes.length + contradictions.length + stale.length === 0 }
}
