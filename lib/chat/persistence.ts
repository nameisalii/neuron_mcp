import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateConversationTitle } from './title'

export const CHAT_EVENT_TYPES = {
  messageSent: 'message_sent',
  answerGenerated: 'answer_generated',
  sourceClicked: 'source_clicked',
  documentOpened: 'document_opened',
  connectorUsed: 'connector_used',
  feedbackSubmitted: 'feedback_submitted',
} as const

async function safeCreateAnalyticsEvent(data: Prisma.ChatAnalyticsEventUncheckedCreateInput) {
  try {
    await prisma.chatAnalyticsEvent.create({ data })
  } catch (err) {
    console.error('[chat] analytics event skipped', err instanceof Error ? err.message : 'unknown error')
  }
}

export function extractRelatedLoadId(text: string): string | null {
  const match = text.match(/\b(?:load|lo|order|shipment)\s*(?:id|#|number|no\.?)?\s*[:#-]?\s*([a-z0-9][a-z0-9-]{2,})\b/i)
    ?? text.match(/\b([0-9]{4,})\b/)
  return match?.[1] ?? null
}

export function titleFromQuestion(question: string): string {
  return generateConversationTitle(question)
}

export async function createOrAppendConversation(params: {
  workspaceId: string
  userId: string
  question: string
  conversationId?: string | null
  sourceContext?: Prisma.InputJsonValue
  messageMetadata?: Prisma.InputJsonValue
}) {
  const relatedLoadId = extractRelatedLoadId(params.question)
  const existing = params.conversationId
    ? await prisma.chatConversation.findFirst({
      where: { id: params.conversationId, workspaceId: params.workspaceId, userId: params.userId },
      select: { id: true },
    })
    : null

  if (params.conversationId && !existing) {
    throw new Error('Conversation not found or not accessible')
  }

  const conversation = existing
    ? await prisma.chatConversation.update({
      where: { id: existing.id },
      data: {
        relatedLoadId: relatedLoadId ?? undefined,
        sourceContext: params.sourceContext ?? undefined,
      },
      select: { id: true },
    })
    : await prisma.chatConversation.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        title: generateConversationTitle(params.question),
        relatedLoadId,
        sourceContext: params.sourceContext ?? Prisma.JsonNull,
      },
      select: { id: true },
    })

  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      workspaceId: params.workspaceId,
      userId: params.userId,
      role: 'user',
      content: params.question,
      relatedLoadId,
      metadata: params.messageMetadata ?? Prisma.JsonNull,
    },
  })

  await safeCreateAnalyticsEvent({
    workspaceId: params.workspaceId,
    userId: params.userId,
    conversationId: conversation.id,
    eventType: CHAT_EVENT_TYPES.messageSent,
    metadata: relatedLoadId ? { relatedLoadId } : Prisma.JsonNull,
  })

  return { conversationId: conversation.id, relatedLoadId }
}

export async function loadRecentConversationMessages(params: {
  workspaceId: string
  userId: string
  conversationId?: string | null
  take?: number
}): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (!params.conversationId) return []
  const conversation = await prisma.chatConversation.findFirst({
    where: { id: params.conversationId, workspaceId: params.workspaceId, userId: params.userId },
    select: {
      messages: {
        where: { role: { in: ['user', 'assistant'] } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(params.take ?? 6, 1), 6),
        select: { role: true, content: true },
      },
    },
  })
  if (!conversation) return []
  return conversation.messages.reverse().map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content,
  }))
}

export async function storeAssistantMessage(params: {
  workspaceId: string
  userId: string
  conversationId: string
  answer: string
  sourceReferences?: Prisma.InputJsonValue
  documentReferences?: Prisma.InputJsonValue
  relatedLoadId?: string | null
  metadata?: Prisma.InputJsonValue
}) {
  await prisma.chatMessage.create({
    data: {
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      role: 'assistant',
      content: params.answer,
      sourceReferences: params.sourceReferences ?? Prisma.JsonNull,
      documentReferences: params.documentReferences ?? Prisma.JsonNull,
      relatedLoadId: params.relatedLoadId,
      metadata: params.metadata ?? Prisma.JsonNull,
    },
  })

  await safeCreateAnalyticsEvent({
    workspaceId: params.workspaceId,
    userId: params.userId,
    conversationId: params.conversationId,
    eventType: CHAT_EVENT_TYPES.answerGenerated,
    metadata: params.metadata ?? Prisma.JsonNull,
  })
}
