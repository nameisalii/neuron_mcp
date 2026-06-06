import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    let workspaceId = url.searchParams.get('workspaceId') ?? undefined
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT)
    const eventType = url.searchParams.get('eventType') ?? undefined
    const filterUserId = url.searchParams.get('userId') ?? undefined

    if (!workspaceId) {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { workspace: { select: { id: true } } },
      })
      if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
      workspaceId = user.workspace.id
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { type: true },
    })

    const isSolo = workspace?.type === 'solo'
    const userIdFilter = isSolo ? userId : filterUserId

    const where = {
      workspaceId,
      ...(eventType ? { eventType } : {}),
      ...(userIdFilter ? { userId: userIdFilter } : {}),
    }

    const [events, total] = await Promise.all([
      prisma.activityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.activityEvent.count({ where }),
    ])

    return NextResponse.json({ success: true, data: events, meta: { total, page, limit } })
  } catch (err) {
    console.error('[activity]', err)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}
