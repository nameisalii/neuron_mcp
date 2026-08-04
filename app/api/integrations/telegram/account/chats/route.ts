import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { decryptTelegramState } from '@/lib/telegram/accountCrypto'
import { getDialogs } from '@/lib/telegram/accountClient'
import { telegramAccountLimits } from '@/lib/telegram/accountConstants'
import { auditTelegramAccount, telegramAccountContext, telegramAccountSyncEnabled } from '@/lib/telegram/accountContext'

const saveSchema = z.object({
  chats: z.array(z.object({
    chatId: z.string().min(1).max(100),
    selected: z.boolean(),
    syncEnabled: z.boolean().optional(),
    visibility: z.enum(['personal', 'team']),
  })).max(500),
})

function safeChat(row: {
  chatId: string; title: string | null; username: string | null; chatType: string | null
  selected: boolean; syncEnabled: boolean; visibility: string; lastSyncedAt: Date | null
  lastMessageAt: Date | null; status: string
}) {
  return {
    id: row.chatId,
    chatId: row.chatId,
    title: row.title ?? 'Telegram chat',
    username: row.username,
    chatType: row.chatType ?? 'group',
    selected: row.selected,
    syncEnabled: row.syncEnabled,
    visibility: row.visibility === 'team' ? 'team' : 'personal',
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    status: row.status,
  }
}

export async function GET() {
  if (!telegramAccountSyncEnabled()) return NextResponse.json({ error: 'Telegram Account Sync is not enabled.', chats: [] }, { status: 404 })
  const current = await telegramAccountContext()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!current.connection?.encryptedSession || current.connection.status !== 'connected') {
    return NextResponse.json({ error: 'Connect your Telegram account first.', chats: [], needsReconnect: current.connection?.status === 'needs_reconnect' }, { status: 404 })
  }
  try {
    const state = decryptTelegramState<{ kind: string; session: string }>(current.connection.encryptedSession)
    const dialogs = await getDialogs(state.session, telegramAccountLimits.maxDialogs())
    await Promise.all(dialogs.map((dialog) => prisma.telegramSelectedChat.upsert({
      where: { telegramAccountConnectionId_chatId: { telegramAccountConnectionId: current.connection!.id, chatId: dialog.chatId } },
      create: {
        workspaceId: current.workspaceId,
        userId: current.userId,
        telegramAccountConnectionId: current.connection!.id,
        ...dialog,
        selected: false,
        syncEnabled: false,
        visibility: 'personal',
        visibilitySetBy: current.userId,
      },
      update: {
        accessHash: dialog.accessHash,
        title: dialog.title,
        username: dialog.username,
        chatType: dialog.chatType,
        lastMessageAt: dialog.lastMessageAt,
      },
    })))
    const rows = await prisma.telegramSelectedChat.findMany({
      where: { workspaceId: current.workspaceId, userId: current.userId, telegramAccountConnectionId: current.connection.id },
      orderBy: [{ selected: 'desc' }, { title: 'asc' }],
    })
    return NextResponse.json({ chats: rows.map(safeChat) })
  } catch {
    await prisma.telegramAccountConnection.update({
      where: { id: current.connection.id },
      data: { status: 'needs_reconnect', lastError: 'Telegram session expired.' },
    }).catch(() => null)
    return NextResponse.json({ error: 'Reconnect your Telegram account to list chats.', chats: [], needsReconnect: true }, { status: 401 })
  }
}

export async function POST(req: Request) {
  if (!telegramAccountSyncEnabled()) return NextResponse.json({ error: 'Telegram Account Sync is not enabled.' }, { status: 404 })
  const current = await telegramAccountContext()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!current.connection || current.connection.status !== 'connected') return NextResponse.json({ error: 'Connect your Telegram account first.' }, { status: 404 })
  const parsed = saveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Telegram chat selection.' }, { status: 400 })
  const ids = [...new Set(parsed.data.chats.map((chat) => chat.chatId))]
  const owned = await prisma.telegramSelectedChat.findMany({
    where: {
      workspaceId: current.workspaceId,
      userId: current.userId,
      telegramAccountConnectionId: current.connection.id,
      chatId: { in: ids },
    },
    select: { id: true, chatId: true, chatType: true },
  })
  if (owned.length !== ids.length) return NextResponse.json({ error: 'One or more Telegram chats are unavailable.' }, { status: 400 })
  const byId = new Map(owned.map((row) => [row.chatId, row]))
  await prisma.$transaction(parsed.data.chats.map((chat) => prisma.telegramSelectedChat.update({
    where: { id: byId.get(chat.chatId)!.id },
    data: {
      selected: chat.selected,
      syncEnabled: chat.selected && chat.syncEnabled !== false,
      visibility: chat.visibility,
      visibilitySetBy: current.userId,
      status: chat.selected ? 'selected' : 'discovered',
    },
  })))
  const selectedCount = parsed.data.chats.filter((chat) => chat.selected && chat.syncEnabled !== false).length
  await auditTelegramAccount(current.workspaceId, current.userId, current.displayName, 'telegram_chat_selection_updated', 'Telegram chat selection updated', { selectedCount })
  return NextResponse.json({ success: true, selectedCount })
}
