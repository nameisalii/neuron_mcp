import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { activeSlackUserToken } from '@/lib/slack/userSync'
import {
  createSlackUserClient,
  listUserAccessibleConversations,
  SlackUserAccessError,
  type SlackConversationType,
} from '@/lib/slack/userClient'
import { SLACK_USER_SYNC_MAX_CONVERSATIONS } from '@/lib/slack/constants'

const saveSchema = z.object({
  conversations: z.array(z.object({
    id: z.string().min(1).max(100),
    selected: z.boolean(),
    syncEnabled: z.boolean(),
    visibility: z.enum(['personal', 'team']),
  })).max(200),
})

async function context() {
  const { userId } = await auth()
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return null
  const connection = await prisma.slackUserConnection.findUnique({
    where: {
      workspaceId_connectedByUserId: {
        workspaceId: user.workspace.id,
        connectedByUserId: userId,
      },
    },
  })
  return { userId, workspaceId: user.workspace.id, connection }
}

function safeConversation(row: {
  conversationId: string
  conversationName: string | null
  conversationType: string | null
  selected: boolean
  syncEnabled: boolean
  visibility: string
  lastSyncedAt: Date | null
  lastMessageAt: Date | null
}) {
  const type = (row.conversationType ?? 'public_channel') as SlackConversationType
  return {
    id: row.conversationId,
    name: row.conversationName ?? 'Slack conversation',
    type,
    isPrivate: type !== 'public_channel',
    isDm: type === 'im',
    isGroupDm: type === 'mpim',
    selected: row.selected,
    syncEnabled: row.syncEnabled,
    visibility: row.visibility === 'team' ? 'team' : 'personal',
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    status: row.syncEnabled ? 'ready' : 'not_selected',
  }
}

export async function GET() {
  try {
    const current = await context()
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!current.connection) {
      return NextResponse.json({ error: 'Connect your Slack account first.', conversations: [] }, { status: 404 })
    }
    const client = createSlackUserClient(await activeSlackUserToken(current.connection))
    const discovered = await listUserAccessibleConversations({
      client,
      maxConversations: SLACK_USER_SYNC_MAX_CONVERSATIONS,
    })
    await Promise.all(discovered.map((conversation) =>
      prisma.slackSelectedConversation.upsert({
        where: {
          slackUserConnectionId_conversationId: {
            slackUserConnectionId: current.connection!.id,
            conversationId: conversation.id,
          },
        },
        create: {
          workspaceId: current.workspaceId,
          userId: current.userId,
          slackUserConnectionId: current.connection!.id,
          slackTeamId: current.connection!.teamId,
          conversationId: conversation.id,
          conversationName: conversation.name,
          conversationType: conversation.type,
          selected: false,
          syncEnabled: false,
          visibility: 'personal',
        },
        update: {
          conversationName: conversation.name,
          conversationType: conversation.type,
          slackTeamId: current.connection!.teamId,
        },
      })))
    const rows = await prisma.slackSelectedConversation.findMany({
      where: {
        workspaceId: current.workspaceId,
        userId: current.userId,
        slackUserConnectionId: current.connection.id,
      },
      orderBy: [{ selected: 'desc' }, { conversationName: 'asc' }],
    })
    return NextResponse.json({ conversations: rows.map(safeConversation) })
  } catch (error) {
    if (error instanceof SlackUserAccessError) {
      return NextResponse.json({
        error: error.message,
        conversations: [],
        requiresAdminApproval: error.requiresAdmin,
        requiresReconnect: error.requiresReconnect,
      }, { status: error.requiresAdmin ? 403 : 400 })
    }
    return NextResponse.json({ error: 'Slack conversations could not be loaded.', conversations: [] }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const current = await context()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!current.connection) return NextResponse.json({ error: 'Connect your Slack account first.' }, { status: 404 })
  const parsed = saveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Slack conversation selection.' }, { status: 400 })

  const ids = [...new Set(parsed.data.conversations.map((item) => item.id))]
  const owned = await prisma.slackSelectedConversation.findMany({
    where: {
      workspaceId: current.workspaceId,
      userId: current.userId,
      slackUserConnectionId: current.connection.id,
      conversationId: { in: ids },
    },
    select: { id: true, conversationId: true, conversationType: true },
  })
  if (owned.length !== ids.length) {
    return NextResponse.json({ error: 'One or more Slack conversations are unavailable.' }, { status: 400 })
  }
  const byConversationId = new Map(owned.map((row) => [row.conversationId, row]))
  await prisma.$transaction(parsed.data.conversations.map((item) => {
    const row = byConversationId.get(item.id)!
    return prisma.slackSelectedConversation.update({
      where: { id: row.id },
      data: {
        selected: item.selected,
        syncEnabled: item.selected && item.syncEnabled,
        visibility: item.visibility,
      },
    })
  }))
  return NextResponse.json({
    success: true,
    selectedCount: parsed.data.conversations.filter((item) => item.selected && item.syncEnabled).length,
  })
}
