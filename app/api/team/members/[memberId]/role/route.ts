import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getWorkspaceForUser } from '@/lib/workspace'
import { assertRole, canManageMembers } from '@/lib/team'

const RoleSchema = z.object({ role: z.enum(['admin', 'member', 'viewer']) })

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await getWorkspaceForUser(userId)
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

  try {
    await assertRole(workspace.id, userId, canManageMembers)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = RoleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  const { memberId } = await params
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } })
  if (!target || target.workspaceId !== workspace.id) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Cannot change the owner role' }, { status: 400 })
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { role: parsed.data.role },
  })

  return NextResponse.json({ member: updated })
}
