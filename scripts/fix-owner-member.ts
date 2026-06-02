import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    include: {
      workspace: {
        include: { members: true },
      },
    },
  })

  let created = 0
  let fixedUserId = 0
  let fixedRole = 0

  for (const user of users) {
    if (!user.workspace) continue

    const { workspace } = user
    const correctMember = workspace.members.find((m) => m.userId === user.clerkId)

    if (correctMember) {
      // Scenario 3: correct userId but wrong role
      if (correctMember.role !== 'owner') {
        await prisma.workspaceMember.update({
          where: { id: correctMember.id },
          data: { role: 'owner' },
        })
        console.log(`[role-fixed] ${user.email} — updated role to owner (was: ${correctMember.role})`)
        fixedRole++
      }
      continue
    }

    // Scenario 2: member exists with DB user.id instead of clerkId
    const wrongIdMember = workspace.members.find((m) => m.userId === user.id)
    if (wrongIdMember) {
      await prisma.workspaceMember.update({
        where: { id: wrongIdMember.id },
        data: { userId: user.clerkId, role: 'owner' },
      })
      console.log(`[id-fixed] ${user.email} — updated userId from DB id to clerkId`)
      fixedUserId++
      continue
    }

    // Scenario 1: no member at all
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.clerkId,
        role: 'owner',
        displayName: user.name ?? user.email,
        status: 'active',
      },
    })
    console.log(`[created] ${user.email} — created owner member`)
    created++
  }

  console.log(`\nDone. created=${created} id-fixed=${fixedUserId} role-fixed=${fixedRole}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
