import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  const workspaceId = user?.workspace?.id
  if (!workspaceId) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  })
  if (!member || member.status !== 'active' || !ALLOWED_ROLES.has(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [knowledgeBySource, integrations, syncStatuses] = await Promise.all([
    prisma.knowledgeItem.groupBy({
      by: ['source'],
      where: { workspaceId },
      _count: { _all: true },
    }),
    prisma.integration.findMany({
      where: { workspaceId },
      select: { id: true, type: true, lastSyncAt: true, teamName: true },
      orderBy: { type: 'asc' },
    }),
    prisma.syncStatus.findMany({
      where: { workspaceId },
      select: { integration: true, status: true, lastSyncAt: true, nextSyncAt: true, errorMessage: true },
      orderBy: { integration: 'asc' },
    }),
  ])

  return NextResponse.json({
    success: true,
    workspaceId,
    knowledgeBySource: Object.fromEntries(
      knowledgeBySource.map((row) => [row.source, row._count._all]),
    ),
    integrations,
    syncStatuses,
  })
}
