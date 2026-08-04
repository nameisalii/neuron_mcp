import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { sendLoginCode } from '@/lib/telegram/accountClient'
import { encryptTelegramState } from '@/lib/telegram/accountCrypto'
import { auditTelegramAccount, telegramAccountContext, telegramAccountSyncEnabled } from '@/lib/telegram/accountContext'

const schema = z.object({ phoneNumber: z.string() })

export function normalizeTelegramPhoneNumber(value: string): string | null {
  const normalized = value.trim().replace(/[\s-]+/g, '')
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
}

export async function POST(req: Request) {
  if (!telegramAccountSyncEnabled()) return NextResponse.json({ error: 'Telegram Account Sync is not enabled.' }, { status: 404 })
  const current = await telegramAccountContext()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  const phoneNumber = parsed.success ? normalizeTelegramPhoneNumber(parsed.data.phoneNumber) : null
  if (!phoneNumber) return NextResponse.json({ error: 'Enter your phone number in international format, for example +12065550123.' }, { status: 400 })
  if (current.connection?.status === 'connected') {
    return NextResponse.json({ error: 'Telegram is already connected. Disconnect first if you want to connect a different account.' }, { status: 409 })
  }
  try {
    const pending = await sendLoginCode(phoneNumber)
    await prisma.telegramAccountConnection.upsert({
      where: { workspaceId_userId: { workspaceId: current.workspaceId, userId: current.userId } },
      create: {
        workspaceId: current.workspaceId,
        userId: current.userId,
        phoneHash: createHash('sha256').update(phoneNumber).digest('hex'),
        encryptedSession: encryptTelegramState({ kind: 'pending_code', ...pending }),
        status: 'pending_code',
      },
      update: {
        phoneHash: createHash('sha256').update(phoneNumber).digest('hex'),
        encryptedSession: encryptTelegramState({ kind: 'pending_code', ...pending }),
        status: 'pending_code',
        lastError: null,
      },
    })
    await auditTelegramAccount(current.workspaceId, current.userId, current.displayName, 'telegram_account_connect_started', 'Telegram account connection started')
    return NextResponse.json({ status: 'pending_code' })
  } catch {
    return NextResponse.json({ error: 'Telegram could not send a login code. Check the number and try again.' }, { status: 400 })
  }
}
