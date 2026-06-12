import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncNotionPages } from '@/lib/notion/sync'

export const maxDuration = 120

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let workspaceId: string | undefined
    try {
      const body = await req.json()
      workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : undefined
    } catch {
      // no body or non-JSON — fall through to user lookup
    }

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
      select: { role: true, status: true, displayName: true },
    })

    if (!member || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { displayName } = member

    await prisma.integration.upsert({
      where: { workspaceId_type: { workspaceId, type: 'notion' } },
      create: { workspaceId, type: 'notion', accessToken: 'notion-static', channels: [] },
      update: {},
    })

    const result = await syncNotionPages(workspaceId, userId, displayName)

    await prisma.integration.update({
      where: { workspaceId_type: { workspaceId, type: 'notion' } },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      pagesProcessed: result.pages,
      chunksCreated: result.chunks,
      skipped: result.skipped,
      failed: result.failed,
      syncedBy: displayName,
    })
  } catch (err) {
    console.error('[notion/sync]', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
