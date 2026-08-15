import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { clamp01 } from './confidence'

export async function createEvidenceClaim(input: { workspaceId: string; targetType: string; targetId: string; claim: string; confidence: number; reasoning?: string; metadata?: Prisma.InputJsonValue; supportingIds?: string[]; conflictingIds?: string[] }) {
  return prisma.evidenceClaim.create({ data: { workspaceId: input.workspaceId, targetType: input.targetType, targetId: input.targetId, claim: input.claim, confidence: clamp01(input.confidence), reasoning: input.reasoning, metadata: input.metadata, evidence: { create: [...new Set(input.supportingIds ?? [])].map(knowledgeItemId => ({ knowledgeItemId, role: 'SUPPORTS' })).concat([...new Set(input.conflictingIds ?? [])].map(knowledgeItemId => ({ knowledgeItemId, role: 'CONFLICTS' }))) } }, include: { evidence: true } })
}

export async function getVisibleEvidence(claimId: string, workspaceId: string, viewerId: string) {
  const claim = await prisma.evidenceClaim.findFirst({ where: { id: claimId, workspaceId }, include: { evidence: { include: { knowledgeItem: true } } } }); if (!claim) return null
  const visible = claim.evidence.filter(({ knowledgeItem }) => knowledgeItem.visibility === 'team' || knowledgeItem.visibility === 'WORKSPACE' || (['personal', 'PERSONAL', 'RESTRICTED'].includes(knowledgeItem.visibility) && knowledgeItem.visibilitySetBy === viewerId))
  return { ...claim, evidence: visible, restrictedEvidenceCount: claim.evidence.length - visible.length }
}
