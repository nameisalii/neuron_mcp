import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { provisionUser } from '@/lib/provision-user'
import DashboardShell from './DashboardShell'

// Dashboard pages depend on the signed-in user (Clerk) and live data, so they
// must render per-request. Forcing dynamic rendering prevents build-time
// prerendering, which fails when auth/env isn't available at build.
export const dynamic = 'force-dynamic'

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

  if (!user?.workspace) redirect('/onboarding')

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

  if (!user.onboardingCompleted) redirect('/onboarding')

  const workspaceId = user?.workspace?.id
  const visibleKnowledge = workspaceId && userId
    ? {
        workspaceId,
        OR: [
          { visibility: 'team' },
          { visibility: 'personal', visibilitySetBy: userId },
        ],
      }
    : null
  let categoryCounts: Array<{ category: string; _count: { _all: number } }> = []
  if (workspaceId) {
    try {
      const visibleCategoryCounts = await prisma.knowledgeItem.groupBy({
        by: ['category'],
        where: visibleKnowledge!,
        _count: { _all: true },
      })
      categoryCounts = visibleCategoryCounts
    } catch (err) {
      if (!(err instanceof Error) || !/Unknown argument `visibility`|Unknown argument `visibilitySetBy`/.test(err.message)) {
        throw err
      }
      const fallbackCategoryCounts = await prisma.knowledgeItem.groupBy({
        by: ['category'],
        where: { workspaceId },
        _count: { _all: true },
      })
      categoryCounts = fallbackCategoryCounts
    }
  }

  const knowledgeCount = categoryCounts.reduce((total, row) => total + row._count._all, 0)
  const decisionCount = categoryCounts.find((row) => row.category === 'decision')?._count._all ?? 0
  const ideaCount = categoryCounts.find((row) => row.category === 'idea')?._count._all ?? 0

  return (
    <DashboardShell
      counts={{ brain: knowledgeCount, decisions: decisionCount, ideas: ideaCount }}
      workspaceId={workspaceId ?? undefined}
    >
      {children}
    </DashboardShell>
  )
}
