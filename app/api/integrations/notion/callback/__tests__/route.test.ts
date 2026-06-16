/** @jest-environment node */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
const getCookie = jest.fn()
const deleteCookie = jest.fn()
jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({ get: getCookie, delete: deleteCookie })) }))
jest.mock('@/lib/crypto', () => ({ encrypt: jest.fn(() => 'encrypted-notion-token') }))
jest.mock('@/lib/db', () => ({
  prisma: {
    workspaceMember: { findUnique: jest.fn() },
    integration: { upsert: jest.fn() },
  },
}))

const makeRequest = (state = 'state-1') => ({
  nextUrl: new URL(`http://localhost/api/integrations/notion/callback?code=code-1&state=${state}`),
}) as never
let infoSpy: jest.SpyInstance
let warnSpy: jest.SpyInstance
let errorSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  process.env.NOTION_CLIENT_ID = 'client'
  process.env.NOTION_CLIENT_SECRET = 'secret'
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-a' })
  getCookie.mockReturnValue({
    value: JSON.stringify({ stateToken: 'state-1', userId: 'user-a', workspaceId: 'workspace-a' }),
  })
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ role: 'owner', status: 'active' })
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      access_token: 'notion-token-a',
      refresh_token: 'notion-refresh-a',
      workspace_id: 'notion-workspace-a',
      workspace_name: 'User A Notion',
      bot_id: 'bot-a',
    }),
  }) as never
})

afterEach(() => {
  infoSpy.mockRestore()
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

it('stores the encrypted token on the state workspace with connectedBy attribution', async () => {
  const response = await GET(makeRequest())

  expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/integrations?connected=notion')
  expect(prisma.integration.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { workspaceId_type: { workspaceId: 'workspace-a', type: 'notion' } },
    create: expect.objectContaining({
      workspaceId: 'workspace-a',
      accessToken: 'encrypted-notion-token',
      metadata: expect.objectContaining({
        status: 'connected',
        connectedBy: 'user-a',
        encryptedRefreshToken: 'encrypted-notion-token',
      }),
    }),
  }))
})

it('sends a form-encoded token exchange request with the OAuth client credentials', async () => {
  await GET(makeRequest())

  expect(global.fetch).toHaveBeenCalledWith(
    'https://api.notion.com/v1/oauth/token',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Basic Y2xpZW50OnNlY3JldA==',
        'Content-Type': 'application/json',
        'Notion-Version': '2026-03-11',
      }),
    }),
  )
  const [, options] = (global.fetch as jest.Mock).mock.calls[0]
  expect(String((options as RequestInit).body)).toContain('"client_id":"client"')
  expect(String((options as RequestInit).body)).toContain('"client_secret":"secret"')
  expect(String((options as RequestInit).body)).toContain('"grant_type":"authorization_code"')
  expect(String((options as RequestInit).body)).toContain('"redirect_uri":"http://localhost:3000/api/integrations/notion/callback"')
  expect(infoSpy).toHaveBeenCalledWith(
    '[notion/callback] Exchanging OAuth code',
    {
      redirectUri: 'http://localhost:3000/api/integrations/notion/callback',
      clientIdPrefix: 'client',
    },
  )
})

it('rejects mismatched state without storing a token', async () => {
  const response = await GET(makeRequest('wrong-state'))

  expect(response.headers.get('location')).toContain('error=notion_failed')
  expect(prisma.integration.upsert).not.toHaveBeenCalled()
  expect(global.fetch).not.toHaveBeenCalled()
})

it('rejects a user who is not an active member of the state workspace', async () => {
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue(null)

  await GET(makeRequest())

  expect(prisma.integration.upsert).not.toHaveBeenCalled()
  expect(global.fetch).not.toHaveBeenCalled()
})

it('surfaces an invalid Notion OAuth client configuration', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: 'invalid_client' }),
  }) as never

  const response = await GET(makeRequest())

  expect(response.headers.get('location')).toContain('error=notion_failed')
  expect(response.headers.get('location')).toContain('reason=invalid_client')
  expect(prisma.integration.upsert).not.toHaveBeenCalled()
  expect(warnSpy).toHaveBeenCalledWith(
    '[notion/callback] Token exchange rejected',
    expect.objectContaining({
      status: 401,
      reason: 'invalid_client',
      providerError: 'invalid_client',
      redirectUri: 'http://localhost:3000/api/integrations/notion/callback',
      clientIdPrefix: 'client',
    }),
  )
})
