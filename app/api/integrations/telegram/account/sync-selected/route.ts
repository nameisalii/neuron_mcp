import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncSelectedTelegramChats } from '@/lib/telegram/accountSync'
import { auditTelegramAccount, telegramAccountContext, telegramAccountSyncEnabled } from '@/lib/telegram/accountContext'

export const maxDuration = 300

export async function POST() {
  if (!telegramAccountSyncEnabled()) return NextResponse.json({ error: 'Telegram Account Sync is not enabled.' }, { status: 404 })
  const current = await telegramAccountContext()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!current.connection?.encryptedSession || current.connection.status !== 'connected') {
    return NextResponse.json({ error: 'Connect your Telegram account first.', needsReconnect: true }, { status: 404 })
  }
  let summary
  try {
    summary = await syncSelectedTelegramChats({
      workspaceId: current.workspaceId,
      userId: current.userId,
      connectionId: current.connection.id,
      encryptedSession: current.connection.encryptedSession,
    })
  } catch {
    await prisma.telegramAccountConnection.update({
      where: { id: current.connection.id },
      data: { status: 'needs_reconnect', lastError: 'Telegram session expired.' },
    }).catch(() => null)
    return NextResponse.json({ error: 'Reconnect your Telegram account before syncing.', needsReconnect: true }, { status: 401 })
  }
  if (summary.selectedChats === 0) return NextResponse.json({ error: 'Choose Telegram chats before syncing.', ...summary }, { status: 400 })
  await auditTelegramAccount(current.workspaceId, current.userId, current.displayName, 'telegram_account_synced', 'Selected Telegram chats synced', summary)
  return NextResponse.json({ success: true, ...summary, lastSyncedAt: new Date().toISOString() })
}
