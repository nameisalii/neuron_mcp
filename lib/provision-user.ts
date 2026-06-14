import { prisma } from '@/lib/db'

export interface ClerkUserProfile {
  clerkId: string
  email: string
  name: string | null
  imageUrl?: string | null
}
export async function provisionUser(profile: ClerkUserProfile) {
  const user = await prisma.user.upsert({
    where: { clerkId: profile.clerkId },
    update: {
      email: profile.email,
      name: profile.name,
    },
    create: {
      clerkId: profile.clerkId,
      email: profile.email,
      name: profile.name,
      onboardingCompleted: false,
    },
  })

  const workspace = await prisma.workspace.upsert({
    where: { ownerId: user.id },
    update: {},
    create: {
      ownerId: user.id,
      name: profile.name ? `${profile.name}'s workspace` : 'My Workspace',
      type: 'solo',
      plan: 'free',
    },
  })

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: profile.clerkId,
      },
    },
    update: {
      displayName: profile.name ?? profile.email,
      avatarUrl: profile.imageUrl ?? null,
      status: 'active',
    },
    create: {
      workspaceId: workspace.id,
      userId: profile.clerkId,
      role: 'owner',
      displayName: profile.name ?? profile.email,
      avatarUrl: profile.imageUrl ?? null,
      status: 'active',
    },
  })

  return { user, workspace }
}
