import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { clerkClient } from '@clerk/nextjs/server'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await params

  const invite = await prisma.invitation.findUnique({ where: { token } })
  if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 })
  }
  if (invite.expiresAt < new Date()) {
    await prisma.invitation.update({ where: { id: invite.id }, data: { status: 'expired' } })
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 })
  }

  // Fetch display name + avatar from Clerk
  const clerk = await clerkClient()
  const clerkUser = await clerk.users.getUser(userId)
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
    clerkUser.emailAddresses[0]?.emailAddress ||
    userId
  const avatarUrl = clerkUser.imageUrl ?? null

  await prisma.$transaction(async (tx) => {
    // Add member to workspace
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
      update: { status: 'active', role: invite.role },
      create: {
        workspaceId: invite.workspaceId,
        userId,
        role: invite.role,
        displayName,
        avatarUrl,
        invitedBy: invite.invitedBy,
        status: 'active',
      },
    })

    // Mark invite accepted
    await tx.invitation.update({
      where: { id: invite.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    })
  })

  return NextResponse.json({ workspaceId: invite.workspaceId, role: invite.role })
}
