import { prisma } from '@/lib/db'
import { clamp01 } from './confidence'

export const RELATIONSHIP_TYPES = ['RELATES_TO', 'SUPPORTS', 'CONTRADICTS', 'SUPERSEDES', 'DECIDED_BY', 'ABOUT_PROJECT', 'ABOUT_CUSTOMER', 'ABOUT_PERSON', 'PART_OF_PROCESS', 'DEPENDS_ON', 'CAUSED_BY'] as const
export type RelationshipType = typeof RELATIONSHIP_TYPES[number]

export async function upsertRelationship(input: { workspaceId: string; sourceKnowledgeItemId: string; targetKnowledgeItemId: string; relationshipType: RelationshipType; confidence: number; metadata?: object }) {
  if (input.sourceKnowledgeItemId === input.targetKnowledgeItemId) throw new Error('A knowledge item cannot relate to itself')
  const count = await prisma.knowledgeItem.count({ where: { workspaceId: input.workspaceId, id: { in: [input.sourceKnowledgeItemId, input.targetKnowledgeItemId] } } })
  if (count !== 2) throw new Error('Relationship endpoints must belong to the workspace')
  const key = { sourceKnowledgeItemId_targetKnowledgeItemId_relationshipType: { sourceKnowledgeItemId: input.sourceKnowledgeItemId, targetKnowledgeItemId: input.targetKnowledgeItemId, relationshipType: input.relationshipType } }
  return prisma.knowledgeRelationship.upsert({ where: key, create: { ...input, confidence: clamp01(input.confidence) }, update: { confidence: clamp01(input.confidence), metadata: input.metadata } })
}

export function getNeighbors(workspaceId: string, knowledgeItemId: string, minimumConfidence = 0) {
  return prisma.knowledgeRelationship.findMany({ where: { workspaceId, confidence: { gte: clamp01(minimumConfidence) }, OR: [{ sourceKnowledgeItemId: knowledgeItemId }, { targetKnowledgeItemId: knowledgeItemId }] }, orderBy: { confidence: 'desc' }, include: { sourceKnowledgeItem: true, targetKnowledgeItem: true } })
}

export function getStrongestRelated(workspaceId: string, knowledgeItemId: string, limit = 10) {
  return prisma.knowledgeRelationship.findMany({ where: { workspaceId, OR: [{ sourceKnowledgeItemId: knowledgeItemId }, { targetKnowledgeItemId: knowledgeItemId }] }, orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }], take: Math.min(100, Math.max(1, limit)) })
}

export async function findPaths(workspaceId: string, from: string, to: string, maxDepth = 4): Promise<string[][]> {
  if (from === to) return [[from]]
  const edges = await prisma.knowledgeRelationship.findMany({ where: { workspaceId }, select: { sourceKnowledgeItemId: true, targetKnowledgeItemId: true } })
  const adjacent = new Map<string, Set<string>>()
  for (const edge of edges) for (const [a, b] of [[edge.sourceKnowledgeItemId, edge.targetKnowledgeItemId], [edge.targetKnowledgeItemId, edge.sourceKnowledgeItemId]]) adjacent.set(a, (adjacent.get(a) ?? new Set()).add(b))
  const queue: string[][] = [[from]]; const paths: string[][] = []; let shortest = Infinity
  while (queue.length) { const path = queue.shift()!; if (path.length - 1 > Math.min(maxDepth, shortest)) continue; for (const next of adjacent.get(path.at(-1)!) ?? []) { if (path.includes(next)) continue; const candidate = [...path, next]; if (next === to) { shortest = candidate.length - 1; paths.push(candidate) } else queue.push(candidate) } }
  return paths.slice(0, 10)
}

export function removeInvalidRelationships(workspaceId: string) {
  return prisma.$executeRaw`DELETE FROM "KnowledgeRelationship" r WHERE r."workspaceId" = ${workspaceId} AND (NOT EXISTS (SELECT 1 FROM "KnowledgeItem" k WHERE k.id = r."sourceKnowledgeItemId" AND k."workspaceId" = ${workspaceId}) OR NOT EXISTS (SELECT 1 FROM "KnowledgeItem" k WHERE k.id = r."targetKnowledgeItemId" AND k."workspaceId" = ${workspaceId}))`
}
