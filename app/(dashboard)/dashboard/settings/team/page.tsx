import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getMemberRole, canInvite } from '@/lib/team'
import TeamPageClient from './TeamPageClient'

export default async function TeamPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const workspace = await prisma.workspace.findUnique({
    where: { ownerId: userId },
    include: {
      members: { where: { status: 'active' }, orderBy: { joinedAt: 'asc' } },
      invitations: { where: { status: 'pending' }, orderBy: { createdAt: 'desc' } },
    },
  })
  if (!workspace) redirect('/dashboard')

  const role = await getMemberRole(workspace.id, userId)
  const canManage = role ? canInvite(role) : false

  return (
    <div className="max-w-3xl mx-auto">
      <TeamPageClient
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        currentUserId={userId}
        currentRole={role ?? 'member'}
        members={workspace.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          displayName: m.displayName,
          avatarUrl: m.avatarUrl,
          role: m.role as 'owner' | 'admin' | 'member' | 'viewer',
          joinedAt: m.joinedAt.toISOString(),
          department: m.department,
        }))}
        invitations={workspace.invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role as 'admin' | 'member' | 'viewer',
          expiresAt: i.expiresAt.toISOString(),
        }))}
        canManage={canManage}
      />
    </div>
  )
}
