/**
 * @jest-environment node
 */
import { provisionUser } from '@/lib/provision-user'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    workspace: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    workspaceMember: {
      findFirst: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
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
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)
  ;(prisma.user.create as jest.Mock).mockResolvedValue({
    id: 'user_db_1',
    clerkId: profile.clerkId,
    email: profile.email,
    onboardingCompleted: false,
  })
  ;(prisma.user.update as jest.Mock).mockImplementation(async ({ where, data }) => ({
    id: where.id,
    email: profile.email,
    onboardingCompleted: true,
    ...data,
  }))
  ;(prisma.workspaceMember.findFirst as jest.Mock).mockResolvedValue(null)
  ;(prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null)
  ;(prisma.workspace.create as jest.Mock).mockResolvedValue({ id: 'workspace_1', ownerId: 'user_db_1' })
})
describe('provisionUser', () => {
  it('creates a new user, personal workspace, and owner membership', async () => {
    const result = await provisionUser(profile)

    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: { clerkId: profile.clerkId },
    })
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: profile.email },
    })
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        clerkId: profile.clerkId,
        email: profile.email,
        name: profile.name,
        onboardingCompleted: false,
      },
    })
    expect(prisma.workspace.create).toHaveBeenCalledWith({
      data: {
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

  it('returns an existing user by clerkId and updates profile fields without changing onboarding', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user_db_existing',
      clerkId: profile.clerkId,
      email: 'old@example.com',
      name: 'Old Name',
      onboardingCompleted: true,
    })
    ;(prisma.workspace.findUnique as jest.Mock).mockResolvedValue({ id: 'workspace_existing' })

    const result = await provisionUser(profile)

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_db_existing' },
      data: {
        clerkId: profile.clerkId,
        email: profile.email,
        name: profile.name,
      },
    })
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(result.user.onboardingCompleted).toBe(true)
    expect(result.workspace.id).toBe('workspace_existing')
  })

  it('attaches a new clerkId to an existing user found by email', async () => {
    ;(prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user_db_email',
        clerkId: 'old_clerk_id',
        email: profile.email,
        name: 'Alice',
        onboardingCompleted: true,
      })
    ;(prisma.workspace.findUnique as jest.Mock).mockResolvedValue({ id: 'workspace_email' })

    const result = await provisionUser(profile)

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_db_email' },
      data: {
        clerkId: profile.clerkId,
        name: profile.name,
      },
    })
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(result.user.clerkId).toBe(profile.clerkId)
  })

  it('uses an existing workspace member workspace instead of creating duplicates on refresh', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'user_db_existing',
      clerkId: profile.clerkId,
      email: profile.email,
      onboardingCompleted: true,
    })
    ;(prisma.workspaceMember.findFirst as jest.Mock).mockResolvedValue({
      id: 'member_1',
      workspaceId: 'workspace_member',
      userId: profile.clerkId,
      workspace: { id: 'workspace_member' },
    })

    const result = await provisionUser(profile)

    expect(prisma.workspace.findUnique).not.toHaveBeenCalled()
    expect(prisma.workspace.create).not.toHaveBeenCalled()
    expect(prisma.workspaceMember.upsert).not.toHaveBeenCalled()
    expect(prisma.workspaceMember.update).toHaveBeenCalledWith({
      where: { id: 'member_1' },
      data: {
        displayName: profile.name,
        avatarUrl: profile.imageUrl,
        status: 'active',
      },
    })
    expect(result.workspace.id).toBe('workspace_member')
  })

  it('recovers from a User.email P2002 by attaching the clerkId to the email row', async () => {
    const conflict = Object.create(Error.prototype)
    conflict.code = 'P2002'
    conflict.meta = { modelName: 'User', target: ['email'] }

    ;(prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user_db_email',
        clerkId: 'old_clerk_id',
        email: profile.email,
      })
    ;(prisma.user.create as jest.Mock).mockRejectedValue(conflict)
    ;(prisma.workspace.findUnique as jest.Mock).mockResolvedValue({ id: 'workspace_email' })

    await provisionUser(profile)

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_db_email' },
      data: {
        clerkId: profile.clerkId,
        name: profile.name,
      },
    })
  })
})
