import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { createTaskSchema, taskCategories, taskStatuses } from '@/lib/tasks/validation'
import { cleanTaskError, taskRequestContext } from '@/lib/tasks/api'

export async function GET(req: Request) {
  try {
    const context = await taskRequestContext()
    if ('response' in context) return context.response
    const params = new URL(req.url).searchParams
    const status = params.get('status')
    const category = params.get('category')
    if (status && !taskStatuses.includes(status as never)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    if (category && !taskCategories.includes(category as never)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    const due = params.get('due')
    const search = params.get('search')?.trim()
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(start); end.setDate(end.getDate() + 1)
    const where: Prisma.TaskWhereInput = {
      workspaceId: context.workspaceId,
      status: status ? status as never : { not: 'archived' },
      ...(category ? { category: category as never } : {}),
      ...(params.get('sourceType') ? { sourceType: params.get('sourceType') } : {}),
      ...(search ? { OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sourceTitle: { contains: search, mode: 'insensitive' } },
        { sourceSnippet: { contains: search, mode: 'insensitive' } },
      ] } : {}),
      ...(due === 'today' ? { dueAt: { gte: start, lt: end } } : due === 'overdue' ? { dueAt: { lt: start }, completedAt: null } : due === 'none' ? { dueAt: null } : {}),
    }
    const tasks = await prisma.task.findMany({ where, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }] })
    return NextResponse.json({ tasks })
  } catch (error) { return cleanTaskError(error, 'Failed to fetch tasks') }
}

export async function POST(req: Request) {
  try {
    const context = await taskRequestContext()
    if ('response' in context) return context.response
    const parsed = createTaskSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid task', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const task = await prisma.task.create({ data: {
      ...parsed.data,
      workspaceId: context.workspaceId,
      status: 'active',
      sourceType: parsed.data.sourceType,
      sourceTitle: parsed.data.sourceTitle || (parsed.data.sourceType === 'manual' ? 'Manual task' : null),
      createdByUserId: context.userId,
      events: { create: { type: 'created', userId: context.userId, message: 'Task created manually' } },
    } })
    return NextResponse.json({ task }, { status: 201 })
  } catch (error) { return cleanTaskError(error, 'Failed to create task') }
}
