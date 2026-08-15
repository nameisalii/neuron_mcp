import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { clamp01 } from './confidence'

export function contradictionFingerprint(subjectKey: string, statementIds: string[]) { return createHash('sha256').update(`${subjectKey}:${[...statementIds].sort().join(':')}`).digest('hex') }
export async function recordContradiction(input: { workspaceId: string; subjectKey: string; title: string; statementIds: string[]; confidence: number; likelyCurrentTruthId?: string }) {
  const fingerprint = contradictionFingerprint(input.subjectKey, input.statementIds); const existing = await prisma.knowledgeContradiction.findUnique({ where: { workspaceId_fingerprint: { workspaceId: input.workspaceId, fingerprint } } })
  if (existing?.status === 'RESOLVED' || existing?.status === 'IGNORED') return existing
  return prisma.knowledgeContradiction.upsert({ where: { workspaceId_fingerprint: { workspaceId: input.workspaceId, fingerprint } }, create: { ...input, fingerprint, confidence: clamp01(input.confidence) }, update: { title: input.title, confidence: clamp01(input.confidence), likelyCurrentTruthId: input.likelyCurrentTruthId } })
}
export function resolveContradiction(id: string, workspaceId: string, userId: string, resolution: object, status: 'RESOLVED' | 'IGNORED' = 'RESOLVED') { return prisma.knowledgeContradiction.updateMany({ where: { id, workspaceId, status: 'OPEN' }, data: { status, resolution, resolvedBy: userId, resolvedAt: new Date() } }) }
