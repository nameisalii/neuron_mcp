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
  process.env.MICROSOFT_CLIENT_ID = 'public-client-id'
  process.env.MICROSOFT_CLIENT_SECRET = 'secret-must-not-leak'
})

it('returns a safe error if Teams env vars are missing', async () => {
  delete process.env.MICROSOFT_CLIENT_ID
  delete process.env.MICROSOFT_CLIENT_SECRET

  const res = await GET(new Request('http://localhost/api/integrations/teams/connect'))
  const body = await res.json()

  expect(res.status).toBe(500)
  expect(body.error).toMatch(/not configured/i)
  expect(JSON.stringify(body)).not.toContain('secret-must-not-leak')
})

it('uses only basic Microsoft scopes by default', async () => {
  const res = await GET(new Request('http://localhost/api/integrations/teams/connect'))
  const location = new URL(res.headers.get('location')!)

  expect(location.pathname).toContain('/oauth2/v2.0/authorize')
  expect(location.pathname).not.toContain('adminconsent')
  expect(location.searchParams.get('scope')?.split(' ')).toEqual(['openid', 'profile', 'email', 'offline_access', 'User.Read'])
  expect(location.toString()).not.toContain('secret-must-not-leak')
  expect(cookieStore.set).toHaveBeenCalledWith('teams_oauth_level', 'basic', expect.any(Object))
})

it('requests Teams scopes only when Teams sync is explicitly selected', async () => {
  const res = await GET(new Request('http://localhost/api/integrations/teams/connect?level=teams'))
  const location = new URL(res.headers.get('location')!)

  expect(location.searchParams.get('scope')?.split(' ')).toEqual([
    'openid', 'profile', 'email', 'offline_access', 'User.Read',
    'Team.ReadBasic.All', 'Channel.ReadBasic.All', 'ChannelMessage.Read.All',
  ])
  expect(cookieStore.set).toHaveBeenCalledWith('teams_oauth_level', 'teams', expect.any(Object))
})
