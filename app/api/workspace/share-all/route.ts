import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'

export async function POST() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const workspaceId = user.workspace.id

  const [workspace, member] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { type: true } }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: clerkId } },
      select: { displayName: true },
    }),
  ])

  if (workspace?.type !== 'team') {
    return NextResponse.json({ error: 'Only available for team workspaces' }, { status: 400 })
  }

  const result = await prisma.notionChunk.updateMany({
    where: { workspaceId, visibility: 'personal', visibilitySetBy: clerkId },
    data: { visibility: 'team' },
  })

  if (member) {
    await trackEvent(
      workspaceId,
      clerkId,
      member.displayName,
      'settings_change',
      `shared ${result.count} personal chunks with the team`,
      { chunksShared: result.count },
    )
  }

  return NextResponse.json({ success: true, chunksShared: result.count })
}
