import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { provisionUser } from '@/lib/provision-user'
import DashboardShell from './DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId: rawUserId } = await auth()
  if (!rawUserId) redirect('/sign-in')
  const userId = rawUserId

  let user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, email: true, onboardingCompleted: true, workspace: { select: { id: true } } },
  })

  if (!user) {
    const clerkUser = await currentUser()
    const email = clerkUser?.emailAddresses[0]?.emailAddress
    if (clerkUser && email) {
      const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null
      await provisionUser({
        clerkId: userId,
        email,
        name,
        imageUrl: clerkUser.imageUrl,
      })
      user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { id: true, email: true, onboardingCompleted: true, workspace: { select: { id: true } } },
      })
    }
  }

  if (!user?.workspace) redirect('/setup')

  // Safety net: owner existed but WorkspaceMember row was never created (e.g. webhook missed)
  if (user?.workspace) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: user.workspace.id, userId } },
      update: {},
      create: {
        workspaceId: user.workspace.id,
        userId,
        role: 'owner',
        displayName: user.email,
        status: 'active',
      },
    })
  }

  if (!user.onboardingCompleted) redirect('/setup')

  return (
    <DashboardShell
      workspaceId={user.workspace.id}
    >
      {children}
    </DashboardShell>
  )
}
