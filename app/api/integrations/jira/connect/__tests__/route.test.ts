/** @jest-environment node */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
  },
}))

const cookieStore = { set: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  ;(cookies as unknown as jest.Mock).mockResolvedValue(cookieStore)
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ workspace: { id: 'ws-1' } })
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ role: 'member' })
  delete process.env.ATLASSIAN_CLIENT_ID
  delete process.env.ATLASSIAN_CLIENT_SECRET
  delete process.env.ATLASSIAN_REDIRECT_URI
})

it('returns a safe error if Jira env vars are missing', async () => {
  const res = await GET()
  const body = await res.json()

  expect(res.status).toBe(500)
  expect(body.error).toMatch(/not configured/i)
})

it('builds Atlassian authorize URL with scopes and state', async () => {
  process.env.ATLASSIAN_CLIENT_ID = 'jira-client-id'
  process.env.ATLASSIAN_CLIENT_SECRET = 'jira-client-secret'
  process.env.ATLASSIAN_REDIRECT_URI = 'http://localhost:3000/api/integrations/jira/callback'

  const res = await GET()
  const location = res.headers.get('location')
  expect(res.status).toBe(307)
  expect(location).toContain('https://auth.atlassian.com/authorize?')
  const url = new URL(location!)
  expect(url.searchParams.get('audience')).toBe('api.atlassian.com')
  expect(url.searchParams.get('response_type')).toBe('code')
  expect(url.searchParams.get('prompt')).toBe('consent')
  expect(url.searchParams.get('client_id')).toBe('jira-client-id')
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/integrations/jira/callback')
  expect(url.searchParams.get('scope')).toBe('offline_access read:jira-work read:jira-user')
  expect(url.searchParams.get('state')).toContain('.user-1.ws-1')
  expect(cookieStore.set).toHaveBeenCalledWith('jira_oauth_state', expect.stringContaining('.user-1.ws-1'), expect.any(Object))
})
