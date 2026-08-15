import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { CONFIDENCE, clamp01 } from './confidence'
import { upsertRelationship } from './knowledgeGraphService'

export function getCurrentTruth(workspaceId: string, subjectKey: string) { return prisma.temporalKnowledgeVersion.findFirst({ where: { workspaceId, subjectKey, isCurrent: true }, orderBy: [{ confidence: 'desc' }, { validFrom: 'desc' }] }) }
export function getTruthAt(workspaceId: string, subjectKey: string, date: Date) { return prisma.temporalKnowledgeVersion.findFirst({ where: { workspaceId, subjectKey, validFrom: { lte: date }, OR: [{ validUntil: null }, { validUntil: { gt: date } }] }, orderBy: [{ confidence: 'desc' }, { validFrom: 'desc' }] }) }
export function getHistory(workspaceId: string, subjectKey: string) { return prisma.temporalKnowledgeVersion.findMany({ where: { workspaceId, subjectKey }, orderBy: { validFrom: 'asc' } }) }
export function compareVersions<T extends { value: unknown; validFrom: Date }>(before: T, after: T) { return { changed: JSON.stringify(before.value) !== JSON.stringify(after.value), before: before.value, after: after.value, durationMs: after.validFrom.getTime() - before.validFrom.getTime() } }

export async function recordVersion(input: { workspaceId: string; knowledgeItemId: string; subjectKey: string; value: Prisma.InputJsonValue; validFrom?: Date; confidence: number; sourceEvidence?: Prisma.InputJsonValue }) {
  const confidence = clamp01(input.confidence); const current = await getCurrentTruth(input.workspaceId, input.subjectKey); const validFrom = input.validFrom ?? new Date()
  if (current && JSON.stringify(current.value) === JSON.stringify(input.value)) return prisma.temporalKnowledgeVersion.update({ where: { id: current.id }, data: { confidence: Math.max(current.confidence, confidence), sourceEvidence: input.sourceEvidence } })
  const shouldSupersede = Boolean(current && confidence >= CONFIDENCE.high)
  const version = await prisma.$transaction(async tx => {
    if (shouldSupersede && current) await tx.temporalKnowledgeVersion.update({ where: { id: current.id }, data: { isCurrent: false, validUntil: validFrom } })
    return tx.temporalKnowledgeVersion.create({ data: { ...input, confidence, validFrom, supersedesId: shouldSupersede ? current?.id : null, isCurrent: !current || shouldSupersede } })
  })
  if (shouldSupersede && current && current.knowledgeItemId !== input.knowledgeItemId) await upsertRelationship({ workspaceId: input.workspaceId, sourceKnowledgeItemId: input.knowledgeItemId, targetKnowledgeItemId: current.knowledgeItemId, relationshipType: 'SUPERSEDES', confidence })
  return version
}
