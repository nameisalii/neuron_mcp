import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cleanTaskError, findWorkspaceTask, taskRequestContext } from '@/lib/tasks/api'
import { reminderSchema } from '@/lib/tasks/validation'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await taskRequestContext(); if ('response' in context) return context.response
    const { id } = await params
    const existing = await findWorkspaceTask(id, context.workspaceId)
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    const parsed = reminderSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid reminder time' }, { status: 400 })
    const metadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown> : {}
    const task = await prisma.task.update({
      where: { id },
      data: {
        metadata: { ...metadata, reminderAt: parsed.data.reminderAt },
        events: { create: { type: 'edited', userId: context.userId, message: `Reminder set for ${parsed.data.reminderAt}` } },
      },
    })
    return NextResponse.json({ task })
  } catch (error) { return cleanTaskError(error, 'Failed to set reminder') }
}
