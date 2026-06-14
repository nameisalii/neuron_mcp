/**
 * @jest-environment node
 */
import { POST } from '@/app/api/onboarding/route'
import { prisma } from '@/lib/db'
import { provisionUser } from '@/lib/provision-user'
import { auth, currentUser } from '@clerk/nextjs/server'

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  currentUser: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: { user: { update: jest.fn() } },
}))

jest.mock('@/lib/provision-user', () => ({
  provisionUser: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'clerk_1' })
  ;(currentUser as unknown as jest.Mock).mockResolvedValue({
    firstName: 'Alice',
    lastName: 'Smith',
    imageUrl: 'https://example.com/alice.png',
    emailAddresses: [{ emailAddress: 'alice@example.com' }],
  })
  ;(provisionUser as jest.Mock).mockResolvedValue({
    user: { id: 'user_1' },
    workspace: { id: 'workspace_1' },
  })
})
describe('POST /api/onboarding', () => {
  it('returns 401 for an unauthenticated user', async () => {
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: null })

    const response = await POST()

    expect(response.status).toBe(401)
    expect(provisionUser).not.toHaveBeenCalled()
  })

  it('provisions all required records and completes onboarding', async () => {
    const response = await POST()

    expect(response.status).toBe(200)
    expect(provisionUser).toHaveBeenCalledWith({
      clerkId: 'clerk_1',
      email: 'alice@example.com',
      name: 'Alice Smith',
      imageUrl: 'https://example.com/alice.png',
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { onboardingCompleted: true },
    })
    expect(await response.json()).toEqual({
      completed: true,
      redirectTo: '/dashboard/overview',
      workspaceId: 'workspace_1',
    })
  })
})
