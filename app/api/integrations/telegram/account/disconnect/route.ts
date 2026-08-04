import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { disconnectSession } from '@/lib/telegram/accountClient'
import { decryptTelegramState } from '@/lib/telegram/accountCrypto'
import { auditTelegramAccount, telegramAccountContext } from '@/lib/telegram/accountContext'

export async function POST() {
  const current = await telegramAccountContext()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (current.connection?.encryptedSession) {
    try {
      const state = decryptTelegramState<{ session: string }>(current.connection.encryptedSession)
      await disconnectSession(state.session)
    } catch {
      // Local session deletion still revokes Neuron access if Telegram is unreachable.
    }
    await prisma.telegramAccountConnection.update({
      where: { id: current.connection.id },
      data: { encryptedSession: null, status: 'disabled', lastError: null },
    })
  }
  await auditTelegramAccount(current.workspaceId, current.userId, current.displayName, 'telegram_account_disconnected', 'Telegram account disconnected')
  return NextResponse.json({ success: true })
}
