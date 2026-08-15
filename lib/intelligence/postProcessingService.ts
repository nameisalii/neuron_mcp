import { prisma } from '@/lib/db'
import { createEvidenceClaim } from './evidenceService'
import { upsertRelationship } from './knowledgeGraphService'
import { recordVersion } from './temporalKnowledgeService'

function subjectKey(category: string, content: string) { return `${category}:${content.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)}` }

export async function postProcessKnowledgeItem(knowledgeItemId: string, workspaceId: string): Promise<void> {
  const item = await prisma.knowledgeItem.findFirst({ where: { id: knowledgeItemId, workspaceId } }); if (!item) return
  if (['fact', 'decision', 'process'].includes(item.category.toLowerCase())) await recordVersion({ workspaceId, knowledgeItemId: item.id, subjectKey: subjectKey(item.category, item.label ?? item.summary ?? item.content), value: { content: item.content }, validFrom: item.sourceCreatedAt ?? item.createdAt, confidence: item.confidence, sourceEvidence: { source: item.source, sourceUrl: item.sourceUrl } })
  await createEvidenceClaim({ workspaceId, targetType: 'knowledge', targetId: item.id, claim: item.content, confidence: item.confidence, reasoning: `Extracted from ${item.source}${item.verified ? ' and verified by a workspace member' : ''}`, supportingIds: [item.id] })
  if (item.sourceExternalId) {
    const related = await prisma.knowledgeItem.findFirst({ where: { workspaceId, source: item.source, sourceExternalId: item.sourceExternalId, id: { not: item.id }, visibility: item.visibility }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (related) await upsertRelationship({ workspaceId, sourceKnowledgeItemId: item.id, targetKnowledgeItemId: related.id, relationshipType: 'RELATES_TO', confidence: Math.min(0.9, item.confidence), metadata: { reason: 'Same source thread, page, or record' } })
  }
}

export function safelyPostProcessKnowledgeItem(knowledgeItemId: string, workspaceId: string) { void postProcessKnowledgeItem(knowledgeItemId, workspaceId).catch(error => console.error('[intelligence/post-process] failed', { knowledgeItemId, error })) }
