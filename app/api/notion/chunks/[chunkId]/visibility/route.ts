import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { moveVector } from '@/lib/pinecone'

const ELEVATED_ROLES = new Set(['admin', 'owner'])

const VisibilitySchema = z.object({
  visibility: z.enum(['personal', 'team']),
})

export async function PATCH(
  req: Request,
  { params }: { params: { chunkId: string } },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { chunkId } = params

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = VisibilitySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid visibility value' }, { status: 400 })
    }

    const { visibility } = parsed.data

    const chunk = await prisma.notionChunk.findUnique({ where: { id: chunkId } })
    if (!chunk) return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })

    const { workspaceId } = chunk

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true, displayName: true },
    })
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isElevated = ELEVATED_ROLES.has(member.role)
    const isChunkOwner = chunk.visibilitySetBy === userId || chunk.visibilitySetBy === null

    if (!isElevated && !isChunkOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const prevVisibility = chunk.visibility

    const updated = await prisma.notionChunk.update({
      where: { id: chunkId },
      data: { visibility, visibilitySetBy: userId },
    })

    if (prevVisibility !== visibility && chunk.pineconeId) {
      const fromNs = prevVisibility === 'team' ? workspaceId : `${workspaceId}:${userId}`
      const toNs = visibility === 'team' ? workspaceId : `${workspaceId}:${userId}`
      void moveVector(chunk.pineconeId, fromNs, toNs)
    }

    const page = await prisma.notionPage.findUnique({
      where: { id: chunk.notionPageId },
      select: { title: true },
    })

    void trackEvent(
      workspaceId,
      userId,
      member.displayName,
      'label',
      `[${member.displayName}] changed chunk visibility to ${visibility} in ${page?.title ?? 'Unknown'}`,
      { chunkId, from: prevVisibility, to: visibility },
    )

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error('[notion/chunks/:chunkId/visibility]', err)
    return NextResponse.json({ error: 'Failed to update visibility' }, { status: 500 })
  }
}
