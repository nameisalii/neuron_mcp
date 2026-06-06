import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const WRITE_ROLES = new Set(['owner', 'admin'])

const SyncStatusSchema = z.object({
  integration: z.enum(['notion', 'slack']),
  mode: z.enum(['manual', 'background']).optional(),
  status: z.enum(['active', 'paused']).optional(),
})

export async function PATCH(req: Request) {
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

    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = SyncStatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { integration, mode, status } = parsed.data
    const now = new Date()

    const updateData = {
      ...(mode !== undefined ? { mode } : {}),
      ...(status !== undefined ? { status, ...(status === 'active' ? { errorMessage: null } : {}) } : {}),
      ...(mode === 'background' ? { nextSyncAt: new Date(now.getTime() + 5 * 60 * 1000) } : {}),
      configuredBy: userId,
    }

    const result = await prisma.syncStatus.upsert({
      where: { workspaceId_integration: { workspaceId, integration } },
      create: { workspaceId, integration, ...updateData },
      update: updateData,
    })

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[settings/sync-status PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
