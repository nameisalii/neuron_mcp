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
  let fallbackCountsPromise: Promise<[number, number, number]> | null = null
  const fallbackCounts = async () => {
    if (!workspaceId) return [0, 0, 0] as const
    fallbackCountsPromise ??= Promise.all([
      prisma.knowledgeItem.count({ where: { workspaceId } }),
      prisma.knowledgeItem.count({ where: { workspaceId, category: 'decision' } }),
      prisma.knowledgeItem.count({ where: { workspaceId, category: 'idea' } }),
    ]) as Promise<[number, number, number]>
    return fallbackCountsPromise
  }

  const [knowledgeCount, decisionCount, ideaCount] = workspaceId
    ? await Promise.all([
        prisma.knowledgeItem.count({ where: visibleKnowledge! }).catch(async (err) => {
          if (err instanceof Error && /Unknown argument `visibility`|Unknown argument `visibilitySetBy`/.test(err.message)) {
            return (await fallbackCounts())[0]
          }
          throw err
        }),
        prisma.knowledgeItem.count({ where: { ...visibleKnowledge!, category: 'decision' } }).catch(async (err) => {
          if (err instanceof Error && /Unknown argument `visibility`|Unknown argument `visibilitySetBy`/.test(err.message)) {
            return (await fallbackCounts())[1]
          }
          throw err
        }),
        prisma.knowledgeItem.count({ where: { ...visibleKnowledge!, category: 'idea' } }).catch(async (err) => {
          if (err instanceof Error && /Unknown argument `visibility`|Unknown argument `visibilitySetBy`/.test(err.message)) {
            return (await fallbackCounts())[2]
          }
          throw err
        }),
      ])
    : [0, 0, 0]

  return (
    <DashboardShell
      counts={{ brain: knowledgeCount, decisions: decisionCount, ideas: ideaCount }}
      workspaceId={workspaceId ?? undefined}
    >
      {children}
    </DashboardShell>
  )
}
