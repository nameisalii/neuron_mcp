import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import DecisionsClient from './DecisionsClient'

export const dynamic = 'force-dynamic'

export default async function DecisionsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { workspace: { select: { id: true } } } })
  if (!user?.workspace) redirect('/onboarding')
  const decisions = await prisma.decision.findMany({ where: { workspaceId: user.workspace.id }, orderBy: { createdAt: 'desc' }, take: 100 })

  return <DecisionsClient initialDecisions={decisions.map(decision => ({
    ...decision,
    madeAt: decision.madeAt?.toISOString() ?? null,
    createdAt: decision.createdAt.toISOString(),
  }))} />
}
