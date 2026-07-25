import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { provisionUser } from '@/lib/provision-user'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clerkUser = await currentUser()
  const email = clerkUser?.emailAddresses[0]?.emailAddress
  if (!clerkUser || !email) {
    return NextResponse.json({ error: 'Clerk user has no email address' }, { status: 400 })
  }

  const { user, workspace } = await provisionUser({
    clerkId: userId,
    email,
    name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
    imageUrl: clerkUser.imageUrl,
  })

  const [sourcedAnswers, connectedIntegrations, savedContext] = await Promise.all([
    prisma.activityEvent.count({ where: { workspaceId: workspace.id, eventType: 'onboarding_question_answered' } }),
    prisma.integration.count({ where: { workspaceId: workspace.id } }),
    prisma.knowledgeItem.count({ where: { workspaceId: workspace.id } }),
  ])
  const completed = sourcedAnswers >= 3 && (connectedIntegrations > 0 || savedContext > 0)
  if (completed && !user.onboardingCompleted) {
    await prisma.user.update({ where: { id: user.id }, data: { onboardingCompleted: true } })
  }

  return NextResponse.json({
    completed,
    progress: { questionsAsked: sourcedAnswers, sourcedAnswers, required: 3 },
    redirectTo: '/dashboard',
    workspaceId: workspace.id,
  })
}
