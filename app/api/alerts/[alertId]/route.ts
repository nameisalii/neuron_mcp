import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const PatchSchema = z.object({ status: z.enum(['read', 'resolved']) })

export async function PATCH(req: Request, props: { params: Promise<{ alertId: string }> }) {
  const params = await props.params;
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { workspace: { select: { id: true } } } })
    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    const { id: workspaceId } = user.workspace

    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
    if (!member || !ALLOWED_ROLES.has(member.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const alert = await prisma.alert.findUnique({ where: { id: params.alertId } })
    if (!alert || alert.workspaceId !== workspaceId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const now = new Date()
    const { status } = parsed.data
    const updated = await prisma.alert.update({
      where: { id: params.alertId },
      data: {
        status,
        ...(status === 'resolved' ? { resolvedBy: userId, resolvedAt: now } : {}),
      },
    })
    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('[alerts/:id PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
