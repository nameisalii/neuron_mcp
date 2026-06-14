import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { getConnectedIntegrationToken } from '@/lib/integrations/connection-server'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    let workspaceId = url.searchParams.get('workspaceId') ?? undefined
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      MAX_LIMIT,
    )
    const search = url.searchParams.get('search') ?? undefined

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
    if (!member || member.status !== 'active' || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const integration = await prisma.integration.findUnique({
      where: { workspaceId_type: { workspaceId, type: 'notion' } },
      select: {
        type: true,
        accessToken: true,
        metadata: true,
        workspace: { select: { type: true, owner: { select: { clerkId: true } } } },
      },
    })
    if (!getConnectedIntegrationToken(integration, {
      currentUserId: userId,
      workspaceType: integration?.workspace.type,
      workspaceOwnerClerkId: integration?.workspace.owner.clerkId,
    })) {
      return NextResponse.json({ error: 'Notion is not connected. Connect Notion first.' }, { status: 400 })
    }

    const { displayName } = member

    const where = {
      workspaceId,
      OR: [
        { syncedBy: userId },
        { chunks: { some: { visibility: 'team' } } },
      ],
      ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
    }

    const [pages, total] = await Promise.all([
      prisma.notionPage.findMany({
        where,
        orderBy: { lastEditedAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        include: { _count: { select: { chunks: true } } },
      }),
      prisma.notionPage.count({ where }),
    ])

    const pageIds = pages.map((p) => p.id)

    const [chunkLabels, syncedByMembers] = await Promise.all([
      prisma.notionChunk.findMany({
        where: { notionPageId: { in: pageIds } },
        select: { notionPageId: true, labels: true },
      }),
      prisma.workspaceMember.findMany({
        where: {
          workspaceId,
          userId: { in: [...new Set(pages.map((p) => p.syncedBy).filter(Boolean) as string[])] },
        },
        select: { userId: true, displayName: true },
      }),
    ])

    const labeledCountMap = new Map<string, number>()
    for (const chunk of chunkLabels) {
      const labels = (chunk.labels as string[]) ?? []
      if (labels.length > 0) {
        labeledCountMap.set(chunk.notionPageId, (labeledCountMap.get(chunk.notionPageId) ?? 0) + 1)
      }
    }

    const syncedByNameMap = new Map(syncedByMembers.map((m) => [m.userId, m.displayName]))

    const data = pages.map((p) => ({
      id: p.id,
      notionPageId: p.notionPageId,
      title: p.title,
      parentPageId: p.parentPageId,
      iconUrl: p.iconUrl,
      lastEditedAt: p.lastEditedAt,
      syncedBy: p.syncedBy,
      syncedByName: syncedByNameMap.get(p.syncedBy ?? '') ?? null,
      syncedAt: p.syncedAt,
      chunkCount: p._count.chunks,
      labeledChunkCount: labeledCountMap.get(p.id) ?? 0,
    }))

    void trackEvent(workspaceId, userId, displayName, 'page_viewed', `Listed ${pages.length} Notion pages`, {
      page,
      limit,
      total,
    })

    return NextResponse.json({ success: true, data, meta: { total, page, limit } })
  } catch (err) {
    console.error('[notion/pages]', err)
    return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 })
  }
}
