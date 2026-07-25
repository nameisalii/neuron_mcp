import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import type { SlackMessage } from '@/types'
import { extractAndCreateSuggestedTaskFromKnowledgeItem } from '@/lib/tasks/service'

const chatSchema = z.object({
  id: z.union([z.number(), z.string()]),
  type: z.string().optional(),
  username: z.string().optional(),
  title: z.string().optional(),
}).passthrough()

const messageSchema = z.object({
  message_id: z.number(),
  date: z.number().optional(),
  text: z.string().optional(),
  chat: chatSchema,
  from: z.object({ is_bot: z.boolean().optional() }).passthrough().optional(),
  sender_chat: z.object({ id: z.union([z.number(), z.string()]).optional() }).passthrough().optional(),
}).passthrough()

const updateSchema = z.object({
  update_id: z.number().optional(),
  message: messageSchema.optional(),
  edited_message: messageSchema.optional(),
  channel_post: messageSchema.optional(),
  edited_channel_post: messageSchema.optional(),
}).passthrough()

export type TelegramSkippedReason =
  | 'unsupported_update'
  | 'unsupported_media'
  | 'empty_text'
  | 'too_short'
  | 'small_talk'
  | 'emoji_only'
  | 'punctuation_only'
  | 'url_only'
  | 'command'
  | 'bot_message'
  | 'unbound_chat'
  | 'binding_command'
  | 'duplicate'
  | 'database_error'

export interface TelegramWebhookResult {
  messagesReceived: number
  messagesProcessed: number
  knowledgeCreated: number
  knowledgeUpdated: number
  skippedReasons: Partial<Record<TelegramSkippedReason, number>>
  extractionErrors: number
  embeddingErrors: number
  databaseErrors: number
  workspaceId?: string
  integrationId?: string
  chatIdHash?: string
  safeDebug?: {
    updateId?: number
    messagePresent: boolean
    chatType?: string
    textLength: number
    isStartCommand: boolean
    bindingFound: boolean
    taskExtractionCalled?: boolean
    taskCreated?: boolean
    taskSkippedReason?: string
  }
}

type TelegramMessage = z.infer<typeof messageSchema>

const SMALL_TALK = new Set([
  'hi',
  'hey',
  'hello',
  'yo',
  'gm',
  'gn',
  'ok',
  'okay',
  'k',
  'yes',
  'no',
  'thanks',
  'thank you',
  'how are you',
  'how are you doing',
  "what's up",
  'whats up',
  'lol',
  'haha',
])

export type TelegramTextSkipReason =
  | 'empty_text'
  | 'too_short'
  | 'small_talk'
  | 'emoji_only'
  | 'punctuation_only'
  | 'url_only'
  | 'command'

export function normalizeTelegramText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function shouldSkipTelegramText(text: string): { skip: boolean; reason?: TelegramTextSkipReason } {
  const normalized = normalizeTelegramText(text)
  if (!normalized) return { skip: true, reason: 'empty_text' }

  // A setup command with a connection code is handled by the binding flow.
  if (/^\/start(?:@\w+)?\s+[A-Za-z0-9_-]{16,128}$/.test(normalized)) return { skip: false }
  if (/^\/[A-Za-z][\w]*(?:@\w+)?(?:\s|$)/.test(normalized)) return { skip: true, reason: 'command' }

  const smallTalkCandidate = normalized
    .toLocaleLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .trim()
  if (SMALL_TALK.has(smallTalkCandidate)) return { skip: true, reason: 'small_talk' }

  if (/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\u200D\uFE0F\u{1F3FB}-\u{1F3FF}\s]+$/u.test(normalized)) {
    return { skip: true, reason: 'emoji_only' }
  }
  if (/^[\p{P}\s]+$/u.test(normalized)) return { skip: true, reason: 'punctuation_only' }
  if (/^(?:https?:\/\/|www\.)\S+$/iu.test(normalized)) return { skip: true, reason: 'url_only' }

  const words = normalized.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []
  if (words.length === 0) return { skip: true, reason: 'too_short' }

  // Known small talk is filtered above. Preserve other short text because a
  // one-word update such as "Roadmap" or "Invoice" can be useful company knowledge.
  return { skip: false }
}

function skipped(result: TelegramWebhookResult, reason: TelegramSkippedReason) {
  result.skippedReasons[reason] = (result.skippedReasons[reason] ?? 0) + 1
}

function extractionErrorCount(diagnostics: ExtractionDiagnostics): number {
  return diagnostics.extractorParseFailed + diagnostics.validationFailed + diagnostics.itemProcessingFailed
}

function externalId(message: TelegramMessage): string {
  return `${String(message.chat.id)}:${message.message_id}`
}

function contentHash(value: string): string {
  return `telegram:${createHash('sha256').update(value).digest('hex')}`
}

export function hashTelegramChatId(chatId: string): string {
  return createHash('sha256').update(chatId).digest('hex').slice(0, 12)
}

function publicSourceUrl(message: TelegramMessage): string | null {
  const username = message.chat.username?.trim()
  if (!username || !['channel', 'supergroup'].includes(message.chat.type ?? '')) return null
  return `https://t.me/${encodeURIComponent(username)}/${message.message_id}`
}

function asExtractionMessage(message: TelegramMessage, text: string): SlackMessage {
  return {
    text,
    user: 'Telegram member',
    channel: 'Telegram chat',
    ts: message.date ? String(message.date) : String(Date.now() / 1000),
    permalink: publicSourceUrl(message) ?? undefined,
  }
}

function bindingCode(text: string): string | null {
  const match = text.trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,128})$/)
  return match?.[1] ?? null
}

function metadataCode(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const code = (metadata as Record<string, unknown>).setupCode
  return typeof code === 'string' ? code : null
}

async function bindChat(message: TelegramMessage, code: string, result: TelegramWebhookResult): Promise<boolean> {
  const candidates = await prisma.integration.findMany({
    where: { type: 'telegram' },
    select: { id: true, workspaceId: true, channels: true, metadata: true },
  })
  const integration = candidates.find((candidate) => metadataCode(candidate.metadata) === code)
  if (!integration) return false

  const chatId = String(message.chat.id)
  const channels = [...new Set([...integration.channels, chatId])]
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      channels,
      teamId: chatId,
      teamName: message.chat.title?.trim() || 'Telegram chat',
      metadata: {
        ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata)
          ? integration.metadata as Record<string, unknown>
          : {}),
        status: 'connected',
        connectedAt: new Date().toISOString(),
      },
    },
  })
  result.workspaceId = integration.workspaceId
  result.integrationId = integration.id
  result.chatIdHash = hashTelegramChatId(chatId)
  return true
}

export async function processTelegramUpdate(payload: unknown): Promise<TelegramWebhookResult> {
  const result: TelegramWebhookResult = {
    messagesReceived: 0,
    messagesProcessed: 0,
    knowledgeCreated: 0,
    knowledgeUpdated: 0,
    skippedReasons: {},
    extractionErrors: 0,
    embeddingErrors: 0,
    databaseErrors: 0,
    safeDebug: { messagePresent: false, textLength: 0, isStartCommand: false, bindingFound: false },
  }

  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    skipped(result, 'unsupported_update')
    return result
  }

  result.safeDebug!.updateId = parsed.data.update_id
  const message = parsed.data.message ?? parsed.data.edited_message ?? parsed.data.channel_post ?? parsed.data.edited_channel_post
  if (!message) {
    skipped(result, 'unsupported_update')
    return result
  }
  result.safeDebug!.messagePresent = true
  result.safeDebug!.chatType = message.chat.type
  result.messagesReceived = 1

  if (message.from?.is_bot) {
    skipped(result, 'bot_message')
    return result
  }

  const rawText = message.text ?? ''
  const text = normalizeTelegramText(rawText)
  result.safeDebug!.textLength = text.length
  if (!text) {
    const hasMedia = Object.keys(message).some((key) =>
      ['photo', 'video', 'audio', 'voice', 'document', 'sticker', 'animation'].includes(key))
    skipped(result, hasMedia ? 'unsupported_media' : 'empty_text')
    return result
  }

  const code = bindingCode(text)
  result.safeDebug!.isStartCommand = Boolean(code)
  if (code) {
    try {
      if (await bindChat(message, code, result)) {
        result.safeDebug!.bindingFound = true
        skipped(result, 'binding_command')
      }
      else skipped(result, 'unbound_chat')
    } catch {
      result.databaseErrors++
      skipped(result, 'database_error')
    }
    return result
  }

  const quality = shouldSkipTelegramText(text)
  if (quality.skip) {
    skipped(result, quality.reason ?? 'too_short')
    return result
  }

  const chatId = String(message.chat.id)
  result.chatIdHash = hashTelegramChatId(chatId)
  const integration = await prisma.integration.findFirst({
    where: { type: 'telegram', channels: { has: chatId } },
    select: { id: true, workspaceId: true },
  })
  if (!integration) {
    skipped(result, 'unbound_chat')
    return result
  }
  result.workspaceId = integration.workspaceId
  result.integrationId = integration.id
  result.safeDebug!.bindingFound = true

  const sourceExternalId = externalId(message)
  const existing = await prisma.knowledgeItem.findFirst({
    where: { workspaceId: integration.workspaceId, source: 'telegram', sourceExternalId },
    select: { id: true },
  })
  if (existing) {
    const taskResult = await extractAndCreateSuggestedTaskFromKnowledgeItem({
      knowledgeItemId: existing.id,
      workspaceId: integration.workspaceId,
    })
    result.safeDebug!.taskExtractionCalled = true
    result.safeDebug!.taskCreated = taskResult.status === 'created'
    result.safeDebug!.taskSkippedReason = taskResult.reason
    skipped(result, 'duplicate')
    return result
  }

  const sourceUrl = publicSourceUrl(message)
  let item: { id: string }
  try {
    item = await prisma.knowledgeItem.create({
      data: {
        workspaceId: integration.workspaceId,
        content: text,
        contentHash: contentHash(sourceExternalId),
        category: 'fact',
        aiSuggestedCategory: 'fact',
        source: 'telegram',
        sourceExternalId,
        sourceUrl,
        sourceMetadata: {
          telegram: true,
          chatType: message.chat.type ?? 'unknown',
          chatTitle: message.chat.title?.trim() || null,
          chatUsername: message.chat.username?.trim() || null,
          messageId: message.message_id,
          updateId: parsed.data.update_id ?? null,
        },
        owner: null,
        confidence: 0.55,
        visibility: 'team',
        sourceCreatedAt: message.date ? new Date(message.date * 1000) : null,
      },
      select: { id: true },
    })
    result.knowledgeCreated++
    result.messagesProcessed++
    const taskResult = await extractAndCreateSuggestedTaskFromKnowledgeItem({
      knowledgeItemId: item.id,
      workspaceId: integration.workspaceId,
    })
    result.safeDebug!.taskExtractionCalled = true
    result.safeDebug!.taskCreated = taskResult.status === 'created'
    result.safeDebug!.taskSkippedReason = taskResult.reason
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      skipped(result, 'duplicate')
    } else {
      result.databaseErrors++
      skipped(result, 'database_error')
    }
    return result
  }

  try {
    const embedding = await generateEmbedding(text)
    await upsertEmbedding(item.id, embedding, {
      workspaceId: integration.workspaceId,
      category: 'fact',
      source: 'telegram',
    })
    await prisma.knowledgeItem.update({ where: { id: item.id }, data: { embeddingId: item.id } })
    result.knowledgeUpdated++
  } catch {
    result.embeddingErrors++
  }

  try {
    const extraction = await extractKnowledgeDetailed(
      [asExtractionMessage(message, text)],
      integration.workspaceId,
      'telegram',
      sourceUrl ?? undefined,
      sourceExternalId,
    )
    result.knowledgeCreated += extraction.items.length
    result.extractionErrors += extractionErrorCount(extraction.diagnostics)
    result.embeddingErrors += extraction.diagnostics.embeddingUpsertFailed
    result.databaseErrors += extraction.diagnostics.knowledgeItemCreateFailed
  } catch {
    result.extractionErrors++
  }

  try {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    })
  } catch {
    result.databaseErrors++
  }

  return result
}
