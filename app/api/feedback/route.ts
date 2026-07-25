import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'

const feedbackTypes = ['General feedback', 'Bug report', 'Feature request', 'Integration request', 'Confusing answer', 'Other'] as const
const schema = z.object({
  type: z.enum(feedbackTypes),
  message: z.string().trim().min(5).max(5000),
  email: z.union([z.string().trim().email(), z.literal('')]).optional(),
  page: z.string().trim().max(300).optional(),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please choose a feedback type and enter at least 5 characters.' }, { status: 400 })
  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { email: true } })
  const event = await prisma.activityEvent.create({
    data: {
      workspaceId: workspace.workspaceId,
      userId,
      displayName: workspace.member.displayName,
      eventType: 'feedback_submitted',
      description: `${workspace.member.displayName} sent product feedback`,
      metadata: {
        type: parsed.data.type,
        message: parsed.data.message,
        email: parsed.data.email || user?.email || null,
        page: parsed.data.page || null,
        status: 'new',
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, feedbackId: event.id }, { status: 201 })
}
