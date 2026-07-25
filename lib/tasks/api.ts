import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'

export async function taskRequestContext() {
  const { userId } = await auth()
  if (!userId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return { response: NextResponse.json({ error: workspace.error }, { status: workspace.status }) }
  return { userId, workspaceId: workspace.workspaceId, displayName: workspace.member.displayName }
}

export async function findWorkspaceTask(id: string, workspaceId: string) {
  return prisma.task.findFirst({ where: { id, workspaceId, status: { not: 'archived' } } })
}

export function cleanTaskError(error: unknown, fallback: string) {
  console.error('[tasks]', error instanceof Error ? error.message : 'unknown error')
  return NextResponse.json({ error: fallback }, { status: 500 })
}
