import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getWorkspaceForUser } from '@/lib/workspace'
import { assertRole, canInvite } from '@/lib/team'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await getWorkspaceForUser(userId)
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

  try {
    await assertRole(workspace.id, userId, canInvite)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { invitationId } = await params
  const invite = await prisma.invitation.findUnique({ where: { id: invitationId } })
  if (!invite || invite.workspaceId !== workspace.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'revoked' } })
  return NextResponse.json({ success: true })
}
