import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'

const UpgradeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
})

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const workspaceId = user.workspace.id

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: clerkId } },
    select: { role: true, displayName: true },
  })
  if (!member || member.role !== 'owner') {
    return NextResponse.json({ error: 'Only the workspace owner can upgrade' }, { status: 403 })
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { type: true },
  })
  if (workspace?.type === 'team') {
    return NextResponse.json({ error: 'Workspace is already a team workspace' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpgradeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const name = parsed.data.name.trim()

  const result = await prisma.$transaction(async (tx) => {
    const updatedWorkspace = await tx.workspace.update({
      where: { id: workspaceId },
      data: { type: 'team', name },
    })

    const chunksResult = await tx.notionChunk.updateMany({
      where: { workspaceId, visibility: 'team', visibilitySetBy: null },
      data: { visibility: 'personal', visibilitySetBy: clerkId },
    })

    return { workspace: updatedWorkspace, chunksMarkedPersonal: chunksResult.count }
  })

  await trackEvent(
    workspaceId,
    clerkId,
    member.displayName,
    'settings_change',
    `upgraded workspace to team: "${name}"`,
    { previousType: 'solo', newType: 'team', workspaceName: name },
  )

  return NextResponse.json({
    success: true,
    workspace: {
      id: result.workspace.id,
      name: result.workspace.name,
      type: result.workspace.type,
    },
    chunksMarkedPersonal: result.chunksMarkedPersonal,
  })
}
