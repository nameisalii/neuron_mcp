import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncSlackMessages } from '@/lib/slack/sync'
import { extractKnowledge } from '@/lib/extraction/extractor'

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: {
        workspace: {
          select: {
            id: true,
            integrations: { where: { type: 'slack' }, take: 1 },
          },
        },
      },
    })

    if (!user?.workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    if (!user.workspace.integrations.length) {
      return NextResponse.json({ error: 'No Slack integration found' }, { status: 404 })
    }

    const workspaceId = user.workspace.id
    const integration = user.workspace.integrations[0]
    const secondsSinceSync = integration.lastSyncAt
      ? Math.floor((Date.now() - integration.lastSyncAt.getTime()) / 1000)
      : null
    const messages = await syncSlackMessages(workspaceId)
    const extracted = await extractKnowledge(messages, workspaceId)

    await prisma.integration.update({
      where: { workspaceId_type: { workspaceId, type: 'slack' } },
      data: { lastSyncAt: new Date() },
    })

    const conflicts = extracted.length === 0
      ? 0
      : await prisma.knowledgeItem.count({
          where: { workspaceId, frozen: true, source: 'slack' },
        })

    return NextResponse.json({
      synced: messages.length,
      extracted: extracted.length,
      conflicts,
    })
  } catch (err) {
    console.error('[slack/sync]', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
