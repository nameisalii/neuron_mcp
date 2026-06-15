/**
 * @jest-environment node
 */
import DashboardLayout from '@/app/(dashboard)/layout'
import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { provisionUser } from '@/lib/provision-user'

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  currentUser: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`)
  }),
}))

jest.mock('@/lib/provision-user', () => ({
  provisionUser: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { upsert: jest.fn() },
    knowledgeItem: { groupBy: jest.fn() },
  },
}))

jest.mock('@/app/(dashboard)/DashboardShell', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}))

beforeEach(() => {
  jest.clearAllMocks()
})
describe('DashboardLayout onboarding guard', () => {
  it('redirects unauthenticated users to sign-in', async () => {
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: null })

    await expect(DashboardLayout({ children: null })).rejects.toThrow('REDIRECT:/sign-in')
  })

  it('provisions a brand-new Clerk user and redirects to onboarding without counting knowledge', async () => {
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'clerk_1' })
    ;(currentUser as unknown as jest.Mock).mockResolvedValue({
      firstName: 'Alice',
      lastName: null,
      imageUrl: null,
      emailAddresses: [{ emailAddress: 'alice@example.com' }],
    })
    ;(prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user_1',
        email: 'alice@example.com',
        onboardingCompleted: false,
        workspace: { id: 'workspace_1' },
      })

    await expect(DashboardLayout({ children: null })).rejects.toThrow('REDIRECT:/onboarding')

    expect(provisionUser).toHaveBeenCalled()
    expect(prisma.workspaceMember.upsert).toHaveBeenCalled()
    expect(prisma.knowledgeItem.groupBy).not.toHaveBeenCalled()
  })
})
