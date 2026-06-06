import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import type { LabeledByEntry } from '@/types'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

const LabelSchema = z.object({
  labels: z.array(z.string()).min(1),
  visibility: z.enum(['personal', 'team']).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: { chunkId: string } },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { chunkId } = params

    const chunk = await prisma.notionChunk.findUnique({ where: { id: chunkId } })
    if (!chunk) return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })

    const { workspaceId } = chunk

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true, displayName: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = LabelSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { labels: newLabels, visibility } = parsed.data
    const { displayName } = member
    const now = new Date().toISOString()

    const existingLabels = (chunk.labels as string[]) ?? []
    const existingLabeledBy = (chunk.labeledBy as unknown as LabeledByEntry[]) ?? []

    const mergedLabels = Array.from(new Set([...existingLabels, ...newLabels]))
    const appendedLabeledBy: LabeledByEntry[] = [
      ...existingLabeledBy,
      ...newLabels.map((label) => ({ userId, label, displayName, at: now })),
    ]

    const data: Prisma.NotionChunkUpdateInput = {
      labels: mergedLabels as Prisma.InputJsonValue,
      labeledBy: appendedLabeledBy as unknown as Prisma.InputJsonValue,
      ...(visibility !== undefined ? { visibility, visibilitySetBy: userId } : {}),
    }

    const updated = await prisma.notionChunk.update({ where: { id: chunkId }, data })

    const page = await prisma.notionPage.findUnique({
      where: { id: chunk.notionPageId },
      select: { title: true },
    })

    void trackEvent(
      workspaceId,
      userId,
      displayName,
      'label',
      `[${displayName}] labeled chunk as ${newLabels.join(', ')} in ${page?.title ?? 'Unknown'}`,
      { chunkId, labels: newLabels },
    )

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error('[notion/chunks/:chunkId/labels]', err)
    return NextResponse.json({ error: 'Failed to update labels' }, { status: 500 })
  }
}
