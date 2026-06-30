import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTelegramWebhookInfo } from '@/lib/telegram/api'
import { getTelegramConfig } from '@/lib/telegram/config'

const MESSAGE = 'Telegram is connected through the Neuron bot. Neuron can ingest new useful messages after the bot is added and connected. Old Telegram history cannot be imported through the official bot API.'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId: user.workspace.id, type: 'telegram' } },
    select: { id: true },
  })
  if (!integration) {
    return NextResponse.json({ success: false, configured: false, message: MESSAGE }, { status: 200 })
  }

  const { botToken } = getTelegramConfig()
  let webhook: { configured: boolean; pendingUpdateCount?: number; hasRecentError?: boolean } = { configured: false }
  if (botToken) {
    try {
      const info = await getTelegramWebhookInfo(botToken)
      webhook = {
        configured: Boolean(info.url),
        pendingUpdateCount: info.pendingUpdateCount,
        hasRecentError: Boolean(info.lastErrorDate),
      }
    } catch {
      webhook = { configured: false }
    }
  }

  return NextResponse.json({
    success: true,
    fetched: 0,
    processed: 0,
    knowledgeCreated: 0,
    message: MESSAGE,
    webhook,
  })
}
