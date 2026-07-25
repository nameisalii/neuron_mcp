import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cleanTaskError, findWorkspaceTask, taskRequestContext } from './api'

const transitions = {
  approve: { from: ['suggested'], status: 'active', event: 'approved' },
  decline: { from: ['suggested'], status: 'declined', event: 'declined' },
  complete: { from: ['active', 'suggested'], status: 'completed', event: 'completed' },
  reopen: { from: ['completed', 'declined'], status: 'active', event: 'reopened' },
} as const

export async function taskAction(id: string, action: keyof typeof transitions) {
  try {
    const context = await taskRequestContext(); if ('response' in context) return context.response
    const task = await findWorkspaceTask(id, context.workspaceId)
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    const transition = transitions[action]
    if (!(transition.from as readonly string[]).includes(task.status)) return NextResponse.json({ error: `Cannot ${action} a ${task.status} task` }, { status: 409 })
    const updated = await prisma.task.update({ where: { id }, data: {
      status: transition.status,
      completedAt: action === 'complete' ? new Date() : action === 'reopen' ? null : undefined,
      events: { create: { type: transition.event, userId: context.userId } },
    } })
    await prisma.activityEvent.create({ data: { workspaceId: context.workspaceId, userId: context.userId, displayName: context.displayName, eventType: 'task', description: `${context.displayName} ${action === 'approve' ? 'approved' : action === 'complete' ? 'completed' : action === 'reopen' ? 'reopened' : 'declined'} ${task.title}`, metadata: { taskId: id, action } } }).catch(() => null)
    return NextResponse.json({ task: updated })
  } catch (error) { return cleanTaskError(error, `Failed to ${action} task`) }
}
