/** @jest-environment node */
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { GET } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/db', () => ({ prisma: { user: { findUnique: jest.fn() } } }))

const mockUserFind = jest.mocked(prisma.user.findUnique)

const originalEnv = process.env
beforeEach(() => {
  jest.clearAllMocks()
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    GMAIL_CLIENT_ID: 'gmail-client',
    GMAIL_CLIENT_SECRET: 'gmail-secret',
    GMAIL_REDIRECT_URI: 'http://localhost:3000/api/integrations/gmail/callback',
    GMAIL_INTEGRATION_ENABLED: 'true',
    GMAIL_PUBLIC_ENABLED: 'false',
  }
  delete process.env.GMAIL_TEST_USERS
  jest.mocked(auth).mockResolvedValue({ userId: 'user-1' } as never)
  jest.mocked(cookies).mockResolvedValue({ set: jest.fn() } as never)
  mockUserFind.mockResolvedValue({ email: 'ali@example.com' } as never)
})
afterAll(() => { process.env = originalEnv })

it('requests only Gmail readonly and never exposes a client secret', async () => {
  process.env.GMAIL_TEST_USERS = 'ali@example.com'
  const response = await GET()
  const location = response.headers.get('location')!
  const url = new URL(location)
  expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly')
  expect(url.searchParams.get('scope')).not.toMatch(/gmail\.modify|gmail\.send|gmail\.compose|mail\.google\.com/)
  expect(location).not.toContain('gmail-secret')
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/integrations/gmail/callback')
})

it('blocks OAuth when the Gmail integration is disabled', async () => {
  process.env.GMAIL_INTEGRATION_ENABLED = 'false'

  const response = await GET()

  expect(response.headers.get('location')).toContain('reason=integration_disabled')
  expect(mockUserFind).not.toHaveBeenCalled()
})

it('does not let the general integration-testing flag bypass the Gmail allowlist', async () => {
  process.env.ENABLE_UPCOMING_INTEGRATION_TESTING = 'true'

  const response = await GET()

  expect(response.headers.get('location')).toContain('reason=verification_pending')
})

it('refuses to start OAuth for a public user while verification is pending', async () => {
  // Arrange — production default: testing off, nobody allowlisted
  delete process.env.ENABLE_UPCOMING_INTEGRATION_TESTING

  // Act
  const response = await GET()

  // Assert — never reaches Google
  const location = response.headers.get('location')!
  expect(location).not.toContain('accounts.google.com')
  expect(location).toContain('error=gmail_failed')
  expect(location).toContain('reason=verification_pending')
})

it('starts OAuth for any signed-in user when public mode is enabled', async () => {
  delete process.env.ENABLE_UPCOMING_INTEGRATION_TESTING
  process.env.GMAIL_PUBLIC_ENABLED = 'true'

  const response = await GET()
  expect(response.headers.get('location')).toContain('accounts.google.com')
})

it('starts OAuth for an allowlisted test user while testing is off', async () => {
  delete process.env.ENABLE_UPCOMING_INTEGRATION_TESTING
  process.env.GMAIL_TEST_USERS = 'Ali@Example.com'

  const response = await GET()

  const location = response.headers.get('location')!
  expect(location).toContain('accounts.google.com')
  expect(new URL(location).searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly')
})

it('blocks an account that is not on the allowlist', async () => {
  delete process.env.ENABLE_UPCOMING_INTEGRATION_TESTING
  process.env.GMAIL_TEST_USERS = 'someone-else@example.com'

  const response = await GET()

  expect(response.headers.get('location')).toContain('reason=verification_pending')
})

it('rejects unauthenticated callers before touching the database', async () => {
  jest.mocked(auth).mockResolvedValue({ userId: null } as never)

  const response = await GET()

  expect(response.status).toBe(401)
  expect(mockUserFind).not.toHaveBeenCalled()
})
