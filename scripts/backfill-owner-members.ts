import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const usersWithoutMembership = await prisma.user.findMany({
    include: {
      workspace: {
        include: {
          members: true,
        },
      },
    },
  })

  let created = 0

  for (const user of usersWithoutMembership) {
    if (!user.workspace) continue

    const hasOwnerMember = user.workspace.members.some((m) => m.userId === user.clerkId)
    if (hasOwnerMember) continue

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: user.workspace.id,
          userId: user.clerkId,
        },
      },
      update: {},
      create: {
        workspaceId: user.workspace.id,
        userId: user.clerkId,
        role: 'owner',
        displayName: user.name ?? user.email,
        status: 'active',
      },
    })

    console.log(`Created owner member for user ${user.email} (${user.clerkId}) in workspace ${user.workspace.id}`)
    created++
  }

  console.log(`Done. Created ${created} missing owner membership(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
