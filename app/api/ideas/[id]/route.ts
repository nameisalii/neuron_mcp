import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    if (!user?.workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const idea = await prisma.knowledgeItem.findFirst({
      where: { id: params.id, workspaceId: user.workspace.id, category: 'idea' },
      select: { id: true },
    })
    if (!idea) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updated = await prisma.knowledgeItem.update({
      where: { id: idea.id },
      data: { verified: true, verifiedAt: new Date() },
    })

    return NextResponse.json({ id: updated.id, actionedAt: updated.verifiedAt })
  } catch (err) {
    console.error('[ideas/patch]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
