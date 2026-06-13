import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const WRITE_ROLES = new Set(['owner', 'admin'])

export async function DELETE(_req: Request, props: { params: Promise<{ ruleId: string }> }) {
  const params = await props.params;
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const { id: workspaceId } = user.workspace

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    })
    if (!member || !WRITE_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rule = await prisma.captureRule.findUnique({ where: { id: params.ruleId } })
    if (!rule || rule.workspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    await prisma.captureRule.delete({ where: { id: params.ruleId } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[settings/capture-rules DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
