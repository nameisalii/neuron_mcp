import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const PatchSchema = z.object({
  focusAreas: z.array(z.string()).optional(),
  digestEnabled: z.boolean().optional(),
  digestTime: z.number().int().min(0).max(23).optional(),
  emailDigest: z.boolean().optional(),
  alertsEnabled: z.boolean().optional(),
  staleThresholdDays: z.number().int().min(1).max(365).optional(),
})

const DEFAULTS = { focusAreas: [], digestEnabled: true, digestTime: 8, emailDigest: false, alertsEnabled: true, staleThresholdDays: 30 }

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { workspace: { select: { id: true } } } })
    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    const { id: workspaceId } = user.workspace

    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
    if (!member || !ALLOWED_ROLES.has(member.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const pref = await prisma.userPreference.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } })
    return NextResponse.json({ data: pref ?? { ...DEFAULTS, id: null, workspaceId, userId } })
  } catch (err) {
    console.error('[settings/preferences GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { workspace: { select: { id: true } } } })
    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    const { id: workspaceId } = user.workspace

    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
    if (!member || !ALLOWED_ROLES.has(member.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })

    const data = parsed.data as Record<string, unknown>
    const result = await prisma.userPreference.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId, ...DEFAULTS, ...data },
      update: data,
    })
    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[settings/preferences PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
