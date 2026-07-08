import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().min(1),
  sourceReferences: z.unknown().optional(),
  documentReferences: z.unknown().optional(),
  relatedLoadId: z.string().optional(),
  metadata: z.unknown().optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  const { id } = await params
  const conversation = await prisma.chatConversation.findFirst({
    where: { id, workspaceId: workspace.workspaceId, userId },
    select: { id: true },
  })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = MessageSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid message' }, { status: 400 })

  const message = await prisma.chatMessage.create({
    data: {
      conversationId: id,
      workspaceId: workspace.workspaceId,
      userId: parsed.data.role === 'user' ? userId : null,
      role: parsed.data.role,
      content: parsed.data.content,
      sourceReferences: parsed.data.sourceReferences == null ? undefined : parsed.data.sourceReferences,
      documentReferences: parsed.data.documentReferences == null ? undefined : parsed.data.documentReferences,
      relatedLoadId: parsed.data.relatedLoadId,
      metadata: parsed.data.metadata == null ? undefined : parsed.data.metadata,
    },
  })

  return NextResponse.json({ success: true, data: message }, { status: 201 })
}
