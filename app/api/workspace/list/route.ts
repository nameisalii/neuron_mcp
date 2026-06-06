import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: clerkId, status: 'active' },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
          iconUrl: true,
          _count: { select: { members: { where: { status: 'active' } } } },
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  })

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name ?? 'My Brain',
    type: m.workspace.type,
    iconUrl: m.workspace.iconUrl,
    role: m.role,
    isOwner: m.role === 'owner',
    memberCount: m.workspace._count.members,
  }))

  return NextResponse.json({ workspaces })
}
