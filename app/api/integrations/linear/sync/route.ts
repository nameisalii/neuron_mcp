import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncLinearIssues } from '@/lib/linear/sync'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: {
        workspace: {
          select: {
            id: true,
            integrations: { where: { type: 'linear' }, take: 1 },
          },
        },
      },
    })

    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    if (!user.workspace.integrations.length) {
      return NextResponse.json({ error: 'No Linear integration found' }, { status: 404 })
    }

    const workspaceId = user.workspace.id

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const integration = user.workspace.integrations[0]
    const result = await syncLinearIssues({
      id: integration.id,
      workspaceId,
      accessToken: integration.accessToken,
      lastSyncAt: integration.lastSyncAt,
      metadata: integration.metadata as Record<string, unknown> | null,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[linear/sync]', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
