/** @jest-environment node */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { exchangeTeamsCode, encodeTeamsToken, getTeamsProfile } from '@/lib/teams/api'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    workspaceMember: { findUnique: jest.fn() },
    integration: { upsert: jest.fn() },
    syncStatus: { upsert: jest.fn() },
  },
}))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/teams/api', () => ({
  exchangeTeamsCode: jest.fn(),
  encodeTeamsToken: jest.fn(() => 'encrypted-teams-token'),
  getTeamsProfile: jest.fn(),
}))

const cookieStore = {
  get: jest.fn(),
  delete: jest.fn(),
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  ;(cookies as unknown as jest.Mock).mockResolvedValue(cookieStore)
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ role: 'member', displayName: 'Ali' })
  ;(prisma.integration.upsert as jest.Mock).mockResolvedValue({ id: 'int-1' })
  ;(prisma.syncStatus.upsert as jest.Mock).mockResolvedValue({})
  ;(exchangeTeamsCode as jest.Mock).mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 123 })
  ;(getTeamsProfile as jest.Mock).mockResolvedValue({ id: 'ms-user-1', displayName: 'Ali' })
})

it('rejects invalid OAuth state', async () => {
  cookieStore.get.mockReturnValue({ value: 'saved.user-1.ws-1' })

  const res = await GET(new Request('http://localhost/api/integrations/teams/callback?code=abc&state=wrong') as never)

  expect(res.status).toBe(307)
  expect(res.headers.get('location')).toContain('reason=invalid_state')
  expect(exchangeTeamsCode).not.toHaveBeenCalled()
})

it('stores encrypted Teams token on callback success', async () => {
  cookieStore.get.mockReturnValue({ value: 'saved.user-1.ws-1' })

  const res = await GET(new Request('http://localhost/api/integrations/teams/callback?code=abc&state=saved.user-1.ws-1') as never)

  expect(res.status).toBe(307)
  expect(encodeTeamsToken).toHaveBeenCalledWith({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 123 })
  expect(prisma.integration.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { workspaceId_type: { workspaceId: 'ws-1', type: 'teams' } },
    create: expect.objectContaining({
      type: 'teams',
      accessToken: 'encrypted-teams-token',
      metadata: expect.objectContaining({ status: 'connected', accountId: 'ms-user-1' }),
    }),
  }))
  expect(res.headers.get('location')).toContain('connected=teams')
})
