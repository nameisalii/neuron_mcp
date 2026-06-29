import { randomBytes } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { setTelegramWebhook } from '@/lib/telegram/api'
import { getTelegramConfig, getTelegramWebhookUrl, isTelegramConfigured } from '@/lib/telegram/config'

const ALLOWED_ROLES = new Set(['owner', 'admin'])

function existingSetupCode(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const code = (metadata as Record<string, unknown>).setupCode
  return typeof code === 'string' && code.length >= 16 ? code : null
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
  const workspaceId = user.workspace.id

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  })
  if (!member || member.status !== 'active' || !ALLOWED_ROLES.has(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const current = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: 'telegram' } },
    select: { metadata: true, channels: true },
  })
  const setupCode = existingSetupCode(current?.metadata) ?? randomBytes(18).toString('base64url')
  const configured = isTelegramConfigured()
  const webhookUrl = getTelegramWebhookUrl()
  let webhookRegistered = false

  if (configured) {
    const { botToken, webhookSecret } = getTelegramConfig()
    try {
      await setTelegramWebhook(botToken!, webhookUrl, webhookSecret!)
      webhookRegistered = true
    } catch {
      return NextResponse.json(
        { error: 'Telegram rejected the webhook configuration. Check the Telegram environment variables and HTTPS webhook URL.' },
        { status: 502 },
      )
    }
  }

  await prisma.integration.upsert({
    where: { workspaceId_type: { workspaceId, type: 'telegram' } },
    update: {
      accessToken: 'telegram-webhook',
      metadata: {
        ...(current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
          ? current.metadata as Record<string, unknown>
          : {}),
        setupCode,
        status: current?.channels.length ? 'connected' : 'pending',
      },
    },
    create: {
      workspaceId,
      type: 'telegram',
      accessToken: 'telegram-webhook',
      channels: [],
      metadata: { setupCode, status: 'pending' },
    },
  })

  return NextResponse.json({
    configured,
    connected: Boolean(current?.channels.length),
    webhookRegistered,
    webhookUrl,
    setupCommand: `/start ${setupCode}`,
    message: configured
      ? 'Add the bot to a group or channel, then send the setup command there.'
      : 'Telegram environment variables are not configured.',
  })
}
