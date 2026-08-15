import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export async function recordFeedback(input: { workspaceId: string; targetType: string; targetId: string; action: string; previousValue?: Prisma.InputJsonValue; correctedValue?: Prisma.InputJsonValue; userId: string }) {
  const feedback = await prisma.intelligenceFeedback.create({ data: input })
  if (input.targetType === 'knowledge' && input.action === 'CONFIRM_CURRENT') await prisma.knowledgeItem.updateMany({ where: { id: input.targetId, workspaceId: input.workspaceId }, data: { verified: true, verifiedAt: new Date(), verifiedBy: input.userId, confidence: 1 } })
  if (input.targetType === 'stale' && input.action === 'DISMISS') await prisma.staleKnowledgeFinding.updateMany({ where: { id: input.targetId, workspaceId: input.workspaceId }, data: { status: 'DISMISSED', dismissedBy: input.userId } })
  return feedback
}
