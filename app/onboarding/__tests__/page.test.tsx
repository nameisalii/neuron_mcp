/**
 * @jest-environment node
 */
import OnboardingPage from '@/app/onboarding/page'
import { auth, currentUser } from '@clerk/nextjs/server'
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

jest.mock('@/app/onboarding/OnboardingClient', () => ({
  __esModule: true,
  default: () => null,
}))

beforeEach(() => {
  jest.clearAllMocks()
})
describe('/onboarding page', () => {
  it('redirects unauthenticated users to sign-in', async () => {
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: null })

    await expect(OnboardingPage()).rejects.toThrow('REDIRECT:/sign-in')
  })

  it('loads for an incomplete user after provisioning missing records', async () => {
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'clerk_1' })
    ;(currentUser as unknown as jest.Mock).mockResolvedValue({
      firstName: 'Alice',
      lastName: null,
      imageUrl: null,
      emailAddresses: [{ emailAddress: 'alice@example.com' }],
    })
    ;(provisionUser as jest.Mock).mockResolvedValue({
      user: { onboardingCompleted: false },
      workspace: { id: 'workspace_1' },
    })

    await expect(OnboardingPage()).resolves.toBeTruthy()
  })

  it('redirects a completed user to dashboard overview', async () => {
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'clerk_1' })
    ;(currentUser as unknown as jest.Mock).mockResolvedValue({
      firstName: 'Alice',
      lastName: null,
      imageUrl: null,
      emailAddresses: [{ emailAddress: 'alice@example.com' }],
    })
    ;(provisionUser as jest.Mock).mockResolvedValue({
      user: { onboardingCompleted: true },
      workspace: { id: 'workspace_1' },
    })

    await expect(OnboardingPage()).rejects.toThrow('REDIRECT:/dashboard/overview')
  })
})
