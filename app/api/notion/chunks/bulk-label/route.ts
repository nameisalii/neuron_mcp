import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import type { LabeledByEntry } from '@/types'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

const BulkLabelSchema = z.object({
  workspaceId: z.string().min(1),
  chunkIds: z.array(z.string()).min(1),
  labels: z.array(z.string()).min(1),
  action: z.enum(['add', 'remove']),
  visibility: z.enum(['personal', 'team']).optional(),
})

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = BulkLabelSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { workspaceId, chunkIds, labels, action, visibility } = parsed.data

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true, displayName: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { displayName } = member
    const now = new Date().toISOString()

    const chunks = await prisma.notionChunk.findMany({
      where: { workspaceId, id: { in: chunkIds } },
    })

    await Promise.all(
      chunks.map(async (chunk) => {
        const existingLabels = (chunk.labels as string[]) ?? []
        const existingLabeledBy = (chunk.labeledBy as unknown as LabeledByEntry[]) ?? []

        const updatedLabels =
          action === 'add'
            ? Array.from(new Set([...existingLabels, ...labels]))
            : existingLabels.filter((l) => !labels.includes(l))

        const appendedLabeledBy: LabeledByEntry[] =
          action === 'add'
            ? [...existingLabeledBy, ...labels.map((label) => ({ userId, label, displayName, at: now }))]
            : existingLabeledBy

        const data: Prisma.NotionChunkUpdateInput = {
          labels: updatedLabels as Prisma.InputJsonValue,
          labeledBy: appendedLabeledBy as unknown as Prisma.InputJsonValue,
          ...(visibility !== undefined ? { visibility, visibilitySetBy: userId } : {}),
        }

        return prisma.notionChunk.update({ where: { id: chunk.id }, data })
      }),
    )

    void trackEvent(
      workspaceId,
      userId,
      displayName,
      'label',
      `[${displayName}] ${action === 'add' ? 'labeled' : 'removed label from'} ${chunks.length} chunks as ${labels.join(', ')}`,
      { chunkIds, labels, action },
    )

    return NextResponse.json({ updated: chunks.length, by: displayName })
  } catch (err) {
    console.error('[notion/chunks/bulk-label]', err)
    return NextResponse.json({ error: 'Failed to bulk label' }, { status: 500 })
  }
}
