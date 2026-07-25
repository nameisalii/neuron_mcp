import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { trackValidationEvent } from '@/lib/activity'

const schema = z.object({
  title: z.string().trim().min(2).max(180), summary: z.string().trim().min(3).max(2000),
  reason: z.string().trim().max(1000).optional(), impact: z.string().trim().max(1000).optional(),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { workspace: { select: { id: true } } } })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: user.workspace.id, userId } },
    select: { displayName: true },
  })
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const decision = await prisma.decision.create({ data: {
    workspaceId: user.workspace.id, title: parsed.data.title, decision: parsed.data.summary,
    reason: parsed.data.reason || null, alternatives: parsed.data.impact ? `Impact: ${parsed.data.impact}` : null,
    source: 'manual', madeBy: userId, madeAt: new Date(),
  } })
  await trackValidationEvent(
    user.workspace.id,
    userId,
    member.displayName,
    'save_decision',
    `${member.displayName} saved a decision`,
    { decisionId: decision.id, decisionStatus: 'saved', sourceType: decision.source },
  )
  return NextResponse.json({ decision }, { status: 201 })
}
