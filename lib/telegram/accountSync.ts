import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { decryptTelegramState } from './accountCrypto'
import { getMessages } from './accountClient'
import { telegramAccountLimits } from './accountConstants'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding, upsertEmbeddingInNamespace } from '@/lib/pinecone'
import { extractAndCreateSuggestedTaskFromKnowledgeItem } from '@/lib/tasks/service'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'

type ConnectedState = { kind: 'connected'; session: string }

export async function syncSelectedTelegramChats(input: {
  workspaceId: string
  userId: string
  connectionId: string
  encryptedSession: string
}) {
  const state = decryptTelegramState<ConnectedState>(input.encryptedSession)
  if (state.kind !== 'connected' || !state.session) throw new Error('TELEGRAM_SESSION_EXPIRED')
  const limits = telegramAccountLimits
  const selected = await prisma.telegramSelectedChat.findMany({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      telegramAccountConnectionId: input.connectionId,
      selected: true,
      syncEnabled: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: limits.maxChatsPerRun(),
  })
  const summary = {
    selectedChats: selected.length,
    syncedChats: 0,
    importedMessages: 0,
    skippedMessages: 0,
    errors: 0,
  }
  let remaining = limits.maxMessagesPerRun()
  const cutoff = new Date(Date.now() - limits.lookbackDays() * 86_400_000)

  for (const chat of selected) {
    if (remaining <= 0) break
    try {
      const messages = (await getMessages(state.session, chat.chatId, {
        limit: Math.min(limits.maxMessagesPerChat(), remaining),
      })).filter((message) => message.date >= cutoff)
      let newest: Date | null = chat.lastMessageAt
      let newestId = chat.newestSyncedMessageId
      let oldestId = chat.oldestSyncedMessageId
      for (const message of messages) {
        if (remaining <= 0) break
        remaining--
        const sourceExternalId = `telegram_account:${chat.chatId}:${message.messageId}`
        const contentHash = `telegram-account:${createHash('sha256')
          .update(`${input.workspaceId}:${input.userId}:${sourceExternalId}`)
          .digest('hex')}`
        const sourceMetadata = {
          provider: 'telegram',
          mode: 'account_sync',
          chatId: chat.chatId,
          chatTitle: chat.title,
          chatUsername: chat.username,
          chatType: chat.chatType,
          messageId: message.messageId,
          telegramDate: message.date.toISOString(),
          externalAuthorId: message.externalAuthorId,
          authorName: message.authorName,
        }
        let knowledge: { id: string }
        try {
          knowledge = await prisma.knowledgeItem.create({
            data: {
              workspaceId: input.workspaceId,
              content: message.text,
              contentHash,
              category: 'fact',
              aiSuggestedCategory: 'fact',
              source: 'telegram',
              sourceExternalId,
              sourceUrl: chat.username ? `https://t.me/${chat.username}/${message.messageId}` : null,
              sourceMetadata,
              confidence: 0.55,
              visibility: chat.visibility === 'team' ? 'team' : 'personal',
              visibilitySetBy: chat.visibilitySetBy ?? (chat.visibility === 'personal' ? input.userId : null),
              sourceCreatedAt: message.date,
            },
            select: { id: true },
          })
        } catch (error) {
          if ((error as { code?: string }).code === 'P2002') {
            summary.skippedMessages++
            continue
          }
          throw error
        }
        summary.importedMessages++
        try {
          const embedding = await generateEmbedding(message.text)
          const vectorMetadata = { workspaceId: input.workspaceId, category: 'fact', source: 'telegram' }
          if (chat.visibility === 'team') await upsertEmbedding(knowledge.id, embedding, vectorMetadata)
          else await upsertEmbeddingInNamespace(knowledge.id, embedding, vectorMetadata, `${input.workspaceId}:personal:${input.userId}`)
          await prisma.knowledgeItem.update({ where: { id: knowledge.id }, data: { embeddingId: knowledge.id } })
        } catch {
          // Postgres remains the source of truth if vector indexing is temporarily unavailable.
        }
        await extractAndCreateSuggestedTaskFromKnowledgeItem({
          knowledgeItemId: knowledge.id,
          workspaceId: input.workspaceId,
        }).catch(() => null)
        await extractKnowledgeDetailed(
          [{ channel: chat.chatId, user: message.authorName ?? 'Telegram user', text: message.text, ts: String(message.date.getTime() / 1000) }],
          input.workspaceId,
          'telegram',
          chat.username ? `https://t.me/${chat.username}/${message.messageId}` : undefined,
          sourceExternalId,
          undefined,
          {
            visibility: chat.visibility === 'team' ? 'team' : 'personal',
            visibilitySetBy: chat.visibility === 'team' ? undefined : input.userId,
            namespace: chat.visibility === 'team' ? undefined : `${input.workspaceId}:personal:${input.userId}`,
            sourceMetadata: sourceMetadata as Prisma.InputJsonObject,
          },
        ).catch(() => null)
        if (!newest || message.date > newest) {
          newest = message.date
          newestId = message.messageId
        }
        if (!oldestId || BigInt(message.messageId) < BigInt(oldestId)) oldestId = message.messageId
      }
      await prisma.telegramSelectedChat.update({
        where: { id: chat.id },
        data: {
          lastSyncedAt: new Date(),
          lastMessageAt: newest,
          newestSyncedMessageId: newestId,
          oldestSyncedMessageId: oldestId,
          status: 'synced',
        },
      })
      summary.syncedChats++
    } catch {
      summary.errors++
      await prisma.telegramSelectedChat.update({ where: { id: chat.id }, data: { status: 'error' } }).catch(() => null)
    }
  }
  await prisma.telegramAccountConnection.update({
    where: { id: input.connectionId },
    data: { lastSyncAt: new Date(), lastError: summary.errors ? 'Some selected chats could not be synced.' : null },
  })
  return summary
}
