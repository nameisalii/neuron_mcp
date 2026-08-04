import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auditTelegramAccount, telegramAccountContext } from '@/lib/telegram/accountContext'

export async function POST() {
  const current = await telegramAccountContext()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.telegramAccountConnection.updateMany({
    where: {
      workspaceId: current.workspaceId,
      userId: current.userId,
      status: { in: ['pending_code', 'pending_password', 'error'] },
    },
    data: {
      encryptedSession: null,
      phoneHash: null,
      lastError: null,
      status: 'disabled',
    },
  })
  await auditTelegramAccount(current.workspaceId, current.userId, current.displayName, 'telegram_account_login_cancelled', 'Telegram account login cancelled')
  return NextResponse.json({ ok: true, status: 'not_connected' })
}
