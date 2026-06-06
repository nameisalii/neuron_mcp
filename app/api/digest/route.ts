import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  type: z.enum(['daily', 'weekly', 'all']).default('all'),
  unread: z.enum(['true', 'false']).optional(),
})

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { workspace: { select: { id: true } } } })
    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    const { id: workspaceId } = user.workspace

    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
    if (!member || !ALLOWED_ROLES.has(member.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
    const { page, limit, type, unread } = parsed.data

    const where = {
      workspaceId, userId,
      ...(type !== 'all' ? { type } : {}),
      ...(unread === 'true' ? { readAt: null } : {}),
    }
    const [data, total] = await Promise.all([
      prisma.digest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.digest.count({ where }),
    ])
    return NextResponse.json({ data, meta: { total, page, limit } })
  } catch (err) {
    console.error('[digest GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
