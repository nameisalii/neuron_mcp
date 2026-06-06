import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function GET(
  _req: Request,
  { params }: { params: { page: string } },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const pageId = params.page

    const notionPage = await prisma.notionPage.findUnique({
      where: { id: pageId },
      include: {
        chunks: { orderBy: { position: 'asc' } },
      },
    })
    if (!notionPage) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

    const { workspaceId } = notionPage

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true, displayName: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const filteredChunks = notionPage.chunks.filter(
      (c) => c.visibility === 'team' || (c.visibility === 'personal' && c.visibilitySetBy === userId),
    )

    const labelDistribution: Record<string, number> = {}
    for (const chunk of filteredChunks) {
      for (const label of (chunk.labels as string[])) {
        labelDistribution[label] = (labelDistribution[label] ?? 0) + 1
      }
    }

    void trackEvent(
      workspaceId,
      userId,
      member.displayName,
      'page_viewed',
      `Viewed page: ${notionPage.title}`,
      { pageId },
    )

    return NextResponse.json({
      success: true,
      data: {
        page: {
          id: notionPage.id,
          notionPageId: notionPage.notionPageId,
          title: notionPage.title,
          parentPageId: notionPage.parentPageId,
          iconUrl: notionPage.iconUrl,
          lastEditedAt: notionPage.lastEditedAt,
          syncedBy: notionPage.syncedBy,
          syncedAt: notionPage.syncedAt,
        },
        chunks: filteredChunks,
        labelDistribution,
      },
    })
  } catch (err) {
    console.error('[notion/pages/:page]', err)
    return NextResponse.json({ error: 'Failed to fetch page' }, { status: 500 })
  }
}
