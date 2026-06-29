import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId: user.workspace.id, type: 'whatsapp' } },
    select: { id: true },
  })
  if (!integration) return NextResponse.json({ error: 'WhatsApp Business is not connected' }, { status: 404 })

  const total = await prisma.knowledgeItem.count({
    where: { workspaceId: user.workspace.id, source: 'whatsapp' },
  })

  return NextResponse.json({
    success: true,
    fetched: 0,
    processed: 0,
    knowledgeCreated: 0,
    synced: total,
    message: 'WhatsApp Business imports new inbound messages through Meta webhooks. No message history is available to pull on demand.',
  })
}
