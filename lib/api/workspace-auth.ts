import { prisma } from '@/lib/db'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function requireWorkspaceMember(userId: string) {
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return { error: 'No workspace found' as const, status: 404 as const }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: user.workspace.id, userId } },
    select: { role: true, status: true, displayName: true },
  })
  if (!member || !ALLOWED_ROLES.has(member.role) || member.status === 'removed') {
    return { error: 'Forbidden' as const, status: 403 as const }
  }

  return { workspaceId: user.workspace.id, member }
}
