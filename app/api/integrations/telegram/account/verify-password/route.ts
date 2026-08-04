import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { signInWithPassword } from '@/lib/telegram/accountClient'
import { decryptTelegramState, encryptTelegramState } from '@/lib/telegram/accountCrypto'
import { auditTelegramAccount, telegramAccountContext, telegramAccountSyncEnabled } from '@/lib/telegram/accountContext'

const schema = z.object({ password: z.string().min(1).max(256) })
type Pending = { kind: 'pending_password'; session: string }

export async function POST(req: Request) {
  if (!telegramAccountSyncEnabled()) return NextResponse.json({ error: 'Telegram Account Sync is not enabled.' }, { status: 404 })
  const current = await telegramAccountContext()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || !current.connection?.encryptedSession || current.connection.status !== 'pending_password') {
    return NextResponse.json({ error: 'Telegram 2FA verification is not pending.' }, { status: 400 })
  }
  try {
    const pending = decryptTelegramState<Pending>(current.connection.encryptedSession)
    const result = await signInWithPassword(pending.session, parsed.data.password)
    await prisma.telegramAccountConnection.update({
      where: { id: current.connection.id },
      data: {
        status: 'connected',
        encryptedSession: encryptTelegramState({ kind: 'connected', session: result.session }),
        externalUserId: result.user.id,
        externalUsername: result.user.username,
        externalDisplayName: result.user.displayName,
        lastError: null,
      },
    })
    await auditTelegramAccount(current.workspaceId, current.userId, current.displayName, 'telegram_account_connected', 'Telegram account connected with 2FA')
    return NextResponse.json({ status: 'connected', user: result.user })
  } catch {
    return NextResponse.json({ error: 'Telegram 2FA verification failed.' }, { status: 400 })
  }
}
