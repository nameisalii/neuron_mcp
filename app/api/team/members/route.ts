import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getWorkspaceForUser } from '@/lib/workspace'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await getWorkspaceForUser(userId)
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, status: 'active' },
    orderBy: { joinedAt: 'asc' },
  })

  return NextResponse.json({ members })
}
