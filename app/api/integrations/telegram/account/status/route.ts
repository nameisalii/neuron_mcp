import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { telegramAccountContext, telegramAccountSyncEnabled } from '@/lib/telegram/accountContext'

export async function GET() {
  if (!telegramAccountSyncEnabled()) {
    return NextResponse.json({ enabled: false, status: 'disabled', selectedChatCount: 0 })
  }
  const current = await telegramAccountContext()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!current.connection) {
    return NextResponse.json({ enabled: true, status: 'not_connected', selectedChatCount: 0, lastSyncAt: null })
  }
  const selectedChatCount = await prisma.telegramSelectedChat.count({
    where: {
      workspaceId: current.workspaceId,
      userId: current.userId,
      telegramAccountConnectionId: current.connection.id,
      selected: true,
      syncEnabled: true,
    },
  })
  return NextResponse.json({
    enabled: true,
    status: current.connection.status,
    username: current.connection.externalUsername,
    displayName: current.connection.externalDisplayName,
    selectedChatCount,
    lastSyncAt: current.connection.lastSyncAt?.toISOString() ?? null,
  })
}
