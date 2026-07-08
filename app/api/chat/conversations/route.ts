import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { extractRelatedLoadId } from '@/lib/chat/persistence'
import { generateConversationTitle } from '@/lib/chat/title'

const CreateConversationSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  relatedLoadId: z.string().min(1).max(80).optional(),
  sourceContext: z.unknown().optional(),
})

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspace = await requireWorkspaceMember(userId)
    if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20) || 20, 1), 50)
    const loadId = url.searchParams.get('loadId') ?? undefined

    const rows = await prisma.chatConversation.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        userId,
        ...(loadId ? { relatedLoadId: loadId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        relatedLoadId: true,
        sourceContext: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
    })

    const conversations = rows.map((conversation) => {
      const lastMessage = conversation.messages[0] ?? null
      return {
        id: conversation.id,
        title: conversation.title,
        preview: lastMessage?.content ?? '',
        lastMessageRole: lastMessage?.role ?? null,
        relatedLoadId: conversation.relatedLoadId,
        sourceContext: conversation.sourceContext,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation._count.messages,
      }
    })

    return NextResponse.json({ success: true, conversations, data: conversations })
  } catch (err) {
    console.error('[chat/conversations] history unavailable', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Could not load conversation history' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const parsed = CreateConversationSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 })

  const title = parsed.data.title?.trim() ? generateConversationTitle(parsed.data.title) : 'New conversation'
  const conversation = await prisma.chatConversation.create({
    data: {
      workspaceId: workspace.workspaceId,
      userId,
      title,
      relatedLoadId: parsed.data.relatedLoadId ?? extractRelatedLoadId(title),
      sourceContext: parsed.data.sourceContext == null ? undefined : parsed.data.sourceContext,
    },
    select: { id: true, title: true, relatedLoadId: true, createdAt: true, updatedAt: true },
  })

  return NextResponse.json({ success: true, data: conversation }, { status: 201 })
}
