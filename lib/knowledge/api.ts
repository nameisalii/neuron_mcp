import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type KnowledgeRequestContext =
  | { response: NextResponse; userId?: never; workspaceId?: never }
  | { response: null; userId: string; workspaceId: string }

export async function knowledgeRequestContext(): Promise<KnowledgeRequestContext> {
  const { userId } = await auth()
  if (!userId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return { response: NextResponse.json({ error: 'No workspace found' }, { status: 404 }) }
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: user.workspace.id, userId } },
    select: { status: true },
  })
  if (member?.status !== 'active') return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { response: null, userId, workspaceId: user.workspace.id }
}
