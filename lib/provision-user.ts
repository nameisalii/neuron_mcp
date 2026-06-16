import { prisma } from '@/lib/db'

export interface ClerkUserProfile {
  clerkId: string
  email: string
  name: string | null
  imageUrl?: string | null
}

function userUpdateData(profile: ClerkUserProfile, includeEmail = true) {
  return {
    clerkId: profile.clerkId,
    ...(includeEmail ? { email: profile.email } : {}),
    ...(profile.name ? { name: profile.name } : {}),
  }
}

function isUserEmailConflict(err: unknown) {
  if (!err || typeof err !== 'object' || !('code' in err) || err.code !== 'P2002') {
    return false
  }

  const meta = 'meta' in err && err.meta && typeof err.meta === 'object' ? err.meta : {}
  const target = 'target' in meta ? meta.target : undefined
  return 'modelName' in meta
    && meta.modelName === 'User'
    && Array.isArray(target)
    && target.includes('email')
}

async function resolveUser(profile: ClerkUserProfile) {
  try {
    const existingByClerkId = await prisma.user.findUnique({
      where: { clerkId: profile.clerkId },
    })

    if (existingByClerkId) {
      return await prisma.user.update({
        where: { id: existingByClerkId.id },
        data: userUpdateData(profile),
      })
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: profile.email },
    })

    if (existingByEmail) {
      return await prisma.user.update({
        where: { id: existingByEmail.id },
        data: userUpdateData(profile, false),
      })
    }

    return await prisma.user.create({
      data: {
        clerkId: profile.clerkId,
        email: profile.email,
        name: profile.name,
        onboardingCompleted: false,
      },
    })
  } catch (err) {
    if (!isUserEmailConflict(err)) {
      throw err
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: profile.email },
    })

    if (!existingByEmail) {
      throw err
    }

    return await prisma.user.update({
      where: { id: existingByEmail.id },
      data: userUpdateData(profile, false),
    })
  }
}

async function ensureWorkspace(profile: ClerkUserProfile, user: Awaited<ReturnType<typeof resolveUser>>) {
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: profile.clerkId },
    include: { workspace: true },
  })

  if (member) {
    await prisma.workspaceMember.update({
      where: { id: member.id },
      data: {
        displayName: profile.name ?? profile.email,
        ...(profile.imageUrl ? { avatarUrl: profile.imageUrl } : {}),
        status: 'active',
      },
    })

    return member.workspace
  }

  let workspace = await prisma.workspace.findUnique({
    where: { ownerId: user.id },
  })

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        ownerId: user.id,
        name: profile.name ? `${profile.name}'s workspace` : 'My Workspace',
        type: 'solo',
        plan: 'free',
      },
    })
  }

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: profile.clerkId,
      },
    },
    update: {
      displayName: profile.name ?? profile.email,
      ...(profile.imageUrl ? { avatarUrl: profile.imageUrl } : {}),
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

  return workspace
}

export async function provisionUser(profile: ClerkUserProfile) {
  const user = await resolveUser(profile)
  const workspace = await ensureWorkspace(profile, user)

  return { user, workspace }
}
