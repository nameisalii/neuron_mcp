import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { signInWithCode } from '@/lib/telegram/accountClient'
import { decryptTelegramState, encryptTelegramState } from '@/lib/telegram/accountCrypto'
import { auditTelegramAccount, telegramAccountContext, telegramAccountSyncEnabled } from '@/lib/telegram/accountContext'

const schema = z.object({ code: z.string().trim().regex(/^\d{4,8}$/) })
type Pending = { kind: 'pending_code'; session: string; phoneNumber: string; phoneCodeHash: string }

export async function POST(req: Request) {
  if (!telegramAccountSyncEnabled()) return NextResponse.json({ error: 'Telegram Account Sync is not enabled.' }, { status: 404 })
  const current = await telegramAccountContext()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || !current.connection?.encryptedSession || current.connection.status !== 'pending_code') {
    return NextResponse.json({ error: 'Start Telegram account connection again.' }, { status: 400 })
  }
  try {
    const pending = decryptTelegramState<Pending>(current.connection.encryptedSession)
    const result = await signInWithCode(pending, parsed.data.code)
    if (result.status === 'pending_password') {
      await prisma.telegramAccountConnection.update({
        where: { id: current.connection.id },
        data: { status: 'pending_password', encryptedSession: encryptTelegramState({ kind: 'pending_password', session: result.session }) },
      })
      return NextResponse.json({ status: 'pending_password' })
    }
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
    await auditTelegramAccount(current.workspaceId, current.userId, current.displayName, 'telegram_account_connected', 'Telegram account connected')
    return NextResponse.json({ status: 'connected', user: result.user })
  } catch {
    return NextResponse.json({ error: 'The Telegram login code is invalid or expired.' }, { status: 400 })
  }
}
