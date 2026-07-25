import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cleanTaskError, findWorkspaceTask, taskRequestContext } from '@/lib/tasks/api'
import { updateTaskSchema } from '@/lib/tasks/validation'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await taskRequestContext(); if ('response' in context) return context.response
    const { id } = await params
    const task = await prisma.task.findFirst({
      where: { id, workspaceId: context.workspaceId, status: { not: 'archived' } },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 20 } },
    })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    return NextResponse.json({ task })
  } catch (error) { return cleanTaskError(error, 'Failed to load task') }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await taskRequestContext(); if ('response' in context) return context.response
    const { id } = await params
    if (!await prisma.task.findFirst({ where: { id, workspaceId: context.workspaceId } })) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    const parsed = updateTaskSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid task update', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const task = await prisma.task.update({ where: { id }, data: { ...parsed.data, completedAt: parsed.data.status === 'completed' ? new Date() : parsed.data.status ? null : undefined, events: { create: { type: 'edited', userId: context.userId } } } })
    return NextResponse.json({ task })
  } catch (error) { return cleanTaskError(error, 'Failed to update task') }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await taskRequestContext(); if ('response' in context) return context.response
    const { id } = await params
    if (!await findWorkspaceTask(id, context.workspaceId)) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    const task = await prisma.task.update({ where: { id }, data: { status: 'archived', events: { create: { type: 'archived', userId: context.userId } } } })
    return NextResponse.json({ task })
  } catch (error) { return cleanTaskError(error, 'Failed to archive task') }
}
