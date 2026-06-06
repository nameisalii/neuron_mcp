import { prisma } from '@/lib/db'
import type { MemberRole } from '@/types'

export async function getMemberRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  })
  if (!member || member.status !== 'active') return null
  return member.role as MemberRole
}

export function canInvite(role: MemberRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canManageMembers(role: MemberRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canSync(role: MemberRole): boolean {
  return role !== 'viewer'
}

export function canLabel(role: MemberRole): boolean {
  return role !== 'viewer'
}

export async function assertRole(
  workspaceId: string,
  userId: string,
  required: (role: MemberRole) => boolean,
): Promise<MemberRole> {
  const role = await getMemberRole(workspaceId, userId)
  if (!role || !required(role)) throw new Error('Forbidden')
  return role
}
