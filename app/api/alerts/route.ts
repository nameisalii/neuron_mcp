import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['conflict', 'stale', 'important', 'all']).default('all'),
  status: z.enum(['unread', 'read', 'resolved', 'all']).default('all'),
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
    const { page, limit, type, status } = parsed.data

    const where = {
      workspaceId,
      ...(type !== 'all' ? { type } : {}),
      ...(status !== 'all' ? { status } : {}),
    }
    const [data, total] = await Promise.all([
      prisma.alert.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.alert.count({ where }),
    ])
    return NextResponse.json({ data, meta: { total, page, limit } })
  } catch (err) {
    console.error('[alerts GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
