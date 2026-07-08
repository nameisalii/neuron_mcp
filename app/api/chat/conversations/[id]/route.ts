import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'

const RenameSchema = z.object({
  title: z.string().trim().min(1).max(80),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspace = await requireWorkspaceMember(userId)
    if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

    const { id } = await params
    const conversation = await prisma.chatConversation.findFirst({
      where: { id, workspaceId: workspace.workspaceId, userId },
      select: {
        id: true,
        title: true,
        relatedLoadId: true,
        sourceContext: true,
        createdAt: true,
        updatedAt: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    return NextResponse.json({ success: true, conversation, data: conversation })
  } catch (err) {
    console.error('[chat/conversations/:id] load failed', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = RenameSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const { id } = await params
  const existing = await prisma.chatConversation.findFirst({
    where: { id, workspaceId: workspace.workspaceId, userId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const conversation = await prisma.chatConversation.update({
    where: { id: existing.id },
    data: { title: parsed.data.title },
    select: {
      id: true,
      title: true,
      relatedLoadId: true,
      sourceContext: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ success: true, conversation, data: conversation })
}
