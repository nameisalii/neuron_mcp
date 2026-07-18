/** @jest-environment node */
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { GET } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: jest.fn() }))

const originalEnv = process.env
beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...originalEnv, NODE_ENV: 'test', NEXT_PUBLIC_APP_URL: 'http://localhost:3000', GMAIL_CLIENT_ID: 'gmail-client', GMAIL_CLIENT_SECRET: 'gmail-secret', GMAIL_REDIRECT_URI: 'http://localhost:3000/api/integrations/gmail/callback' }
  jest.mocked(auth).mockResolvedValue({ userId: 'user-1' } as never)
  jest.mocked(cookies).mockResolvedValue({ set: jest.fn() } as never)
})
afterAll(() => { process.env = originalEnv })

it('requests only Gmail readonly and never exposes a client secret', async () => {
  const response = await GET()
  const location = response.headers.get('location')!
  const url = new URL(location)
  expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly')
  expect(url.searchParams.get('scope')).not.toMatch(/gmail\.modify|gmail\.send|gmail\.compose|mail\.google\.com/)
  expect(location).not.toContain('gmail-secret')
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/integrations/gmail/callback')
})
