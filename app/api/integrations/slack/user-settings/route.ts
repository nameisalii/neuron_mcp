import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const settingsSchema = z.object({
  publicChannels: z.boolean(),
  privateChannels: z.boolean(),
  groupDms: z.boolean(),
  dms: z.boolean(),
  excludedConversationIds: z.array(z.string().min(1).max(100)).max(500).default([]),
  excludedConversationNames: z.array(z.string().min(1).max(100)).max(500).default([]),
})

async function context() {
  const { userId } = await auth()
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  return user?.workspace ? { userId, workspaceId: user.workspace.id } : null
}

export async function PATCH(req: Request) {
  const current = await context()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Slack privacy settings' }, { status: 400 })
  const result = await prisma.slackUserConnection.updateMany({
    where: { workspaceId: current.workspaceId, connectedByUserId: current.userId },
    data: { settings: parsed.data },
  })
  if (result.count === 0) return NextResponse.json({ error: 'No personal Slack connection found' }, { status: 404 })
  return NextResponse.json({ success: true, settings: parsed.data })
}

export async function DELETE() {
  const current = await context()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await prisma.slackUserConnection.deleteMany({
    where: { workspaceId: current.workspaceId, connectedByUserId: current.userId },
  })
  return NextResponse.json({ success: true, disconnected: true })
}
