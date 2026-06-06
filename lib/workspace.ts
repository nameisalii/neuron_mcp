import { prisma } from '@/lib/db'
import type { WorkspaceSummary, MemberRole } from '@/types'

export async function getWorkspaceForUser(clerkId: string) {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      workspace: {
        include: { members: { where: { status: 'active' } } },
      },
    },
  })
  return user?.workspace ?? null
}

export async function getAllWorkspacesForUser(clerkId: string): Promise<WorkspaceSummary[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: clerkId, status: 'active' },
    include: {
      workspace: { select: { id: true, name: true, type: true, iconUrl: true, plan: true } },
    },
  })
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    type: m.workspace.type as WorkspaceSummary['type'],
    iconUrl: m.workspace.iconUrl,
    plan: m.workspace.plan as WorkspaceSummary['plan'],
    role: m.role as MemberRole,
  }))
}

export async function getWorkspaceById(workspaceId: string, clerkId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: clerkId } },
    select: { role: true, status: true },
  })
  if (!member || member.status !== 'active') return null

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  return workspace ? { workspace, role: member.role as MemberRole } : null
}
