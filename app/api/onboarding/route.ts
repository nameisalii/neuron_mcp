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

  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingCompleted: true },
  })

  return NextResponse.json({
    completed: true,
    redirectTo: '/dashboard/overview',
    workspaceId: workspace.id,
  })
}
