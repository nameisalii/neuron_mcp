/**
 * @jest-environment node
 */
import { provisionUser } from '@/lib/provision-user'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { upsert: jest.fn() },
    workspace: { upsert: jest.fn() },
    workspaceMember: { upsert: jest.fn() },
  },
}))

const profile = {
  clerkId: 'user_clerk_123',
  email: 'alice@example.com',
  name: 'Alice Smith',
  imageUrl: 'https://example.com/alice.png',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.user.upsert as jest.Mock).mockResolvedValue({
    id: 'user_db_1',
    onboardingCompleted: false,
  })
  ;(prisma.workspace.upsert as jest.Mock).mockResolvedValue({ id: 'workspace_1' })
})
describe('provisionUser', () => {
  it('idempotently creates a new user, personal workspace, and owner membership', async () => {
    const result = await provisionUser(profile)

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { clerkId: profile.clerkId },
      update: { email: profile.email, name: profile.name },
      create: {
        clerkId: profile.clerkId,
        email: profile.email,
        name: profile.name,
        onboardingCompleted: false,
      },
    })
    expect(prisma.workspace.upsert).toHaveBeenCalledWith({
      where: { ownerId: 'user_db_1' },
      update: {},
      create: {
        ownerId: 'user_db_1',
        name: "Alice Smith's workspace",
        type: 'solo',
        plan: 'free',
      },
    })
    expect(prisma.workspaceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_userId: {
            workspaceId: 'workspace_1',
            userId: profile.clerkId,
          },
        },
        create: expect.objectContaining({ role: 'owner', status: 'active' }),
      }),
    )
    expect(result.workspace.id).toBe('workspace_1')
  })
})
