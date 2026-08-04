/**
 * @jest-environment node
 */
import OnboardingPage from '@/app/onboarding/page'
jest.mock('next/navigation', () => ({
  redirect: jest.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`)
  }),
}))

beforeEach(() => {
  jest.clearAllMocks()
})
describe('/onboarding page', () => {
  it('redirects the legacy onboarding URL to setup', () => {
    expect(() => OnboardingPage()).toThrow('REDIRECT:/setup')
  })
})
