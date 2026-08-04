import { auth } from '@clerk/nextjs/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export function telegramAccountSyncEnabled() {
  return process.env.TELEGRAM_ACCOUNT_SYNC_ENABLED === 'true'
}

export async function telegramAccountContext() {
  const { userId } = await auth()
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: {
      name: true,
      workspace: { select: { id: true } },
    },
  })
  if (!user?.workspace) return null
  const connection = await prisma.telegramAccountConnection.findUnique({
    where: { workspaceId_userId: { workspaceId: user.workspace.id, userId } },
  })
  return {
    userId,
    workspaceId: user.workspace.id,
    displayName: user.name || 'Neuron user',
    connection,
  }
}

export async function auditTelegramAccount(
  workspaceId: string,
  userId: string,
  displayName: string,
  eventType: string,
  description: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.activityEvent.create({
    data: { workspaceId, userId, displayName, eventType, description, metadata: metadata as Prisma.InputJsonValue | undefined },
  }).catch(() => null)
}
