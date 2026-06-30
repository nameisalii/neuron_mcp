/** @jest-environment node */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { exchangeJiraCode, encodeJiraToken, getAccessibleJiraResources } from '@/lib/jira/api'

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
jest.mock('@/lib/jira/api', () => ({
  exchangeJiraCode: jest.fn(),
  encodeJiraToken: jest.fn(() => 'encrypted-jira-token'),
  getAccessibleJiraResources: jest.fn(),
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
  ;(exchangeJiraCode as jest.Mock).mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 123 })
  ;(getAccessibleJiraResources as jest.Mock).mockResolvedValue([
    { id: 'cloud-1', url: 'https://example.atlassian.net', name: 'Example Jira', scopes: ['read:jira-work'] },
    { id: 'cloud-2', url: 'https://second.atlassian.net', name: 'Second Jira', scopes: ['read:jira-work'] },
  ])
})

it('rejects invalid OAuth state', async () => {
  cookieStore.get.mockReturnValue({ value: 'saved.user-1.ws-1' })

  const res = await GET(new Request('http://localhost/api/integrations/jira/callback?code=abc&state=wrong'))

  expect(res.status).toBe(307)
  expect(res.headers.get('location')).toContain('reason=invalid_state')
  expect(exchangeJiraCode).not.toHaveBeenCalled()
})

it('stores encrypted token and first cloudId on callback success', async () => {
  cookieStore.get.mockReturnValue({ value: 'saved.user-1.ws-1' })

  const res = await GET(new Request('http://localhost/api/integrations/jira/callback?code=abc&state=saved.user-1.ws-1'))

  expect(res.status).toBe(307)
  expect(encodeJiraToken).toHaveBeenCalledWith({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 123 })
  expect(prisma.integration.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { workspaceId_type: { workspaceId: 'ws-1', type: 'jira' } },
    create: expect.objectContaining({
      type: 'jira',
      accessToken: 'encrypted-jira-token',
      teamId: 'cloud-1',
      teamName: 'Example Jira',
      metadata: expect.objectContaining({
        status: 'connected',
        cloudId: 'cloud-1',
        siteUrl: 'https://example.atlassian.net',
        resources: expect.arrayContaining([expect.objectContaining({ id: 'cloud-2' })]),
      }),
    }),
  }))
  expect(res.headers.get('location')).toContain('connected=jira')
})

it('handles no accessible Jira resources', async () => {
  cookieStore.get.mockReturnValue({ value: 'saved.user-1.ws-1' })
  ;(getAccessibleJiraResources as jest.Mock).mockResolvedValue([])

  const res = await GET(new Request('http://localhost/api/integrations/jira/callback?code=abc&state=saved.user-1.ws-1'))

  expect(res.status).toBe(307)
  expect(res.headers.get('location')).toContain('reason=no_accessible_resources')
  expect(prisma.integration.upsert).not.toHaveBeenCalled()
})
