/** @jest-environment node */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
const setCookie = jest.fn()
jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({ set: setCookie })) }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
  },
}))

const request = new Request('http://localhost/api/integrations/notion/connect')

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NOTION_CLIENT_ID = 'notion-client'
  process.env.NOTION_CLIENT_SECRET = 'notion-secret'
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ workspace: { id: 'workspace-1' } })
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ role: 'owner', status: 'active' })
})

describe('GET /api/integrations/notion/connect', () => {
  it('starts Notion OAuth with state tied to user and workspace', async () => {
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://api.notion.com/v1/oauth/authorize')
    expect(location.searchParams.get('client_id')).toBe('notion-client')
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/integrations/notion/callback')
    expect(setCookie).toHaveBeenCalledWith(
      'notion_oauth_state',
      expect.stringContaining('"userId":"user-1"'),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    )
    expect(setCookie.mock.calls[0][1]).toContain('"workspaceId":"workspace-1"')
  })

  it('does not create an Integration before the OAuth callback', async () => {
    await GET(request)
    expect(prisma).not.toHaveProperty('integration')
  })

  it('does not start OAuth for an inactive workspace membership', async () => {
    ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ role: 'owner', status: 'inactive' })

    const response = await GET(request)

    expect(response.headers.get('location')).toContain('error=notion_forbidden')
    expect(setCookie).not.toHaveBeenCalled()
  })

  it('does not start OAuth when the Notion client secret is missing', async () => {
    delete process.env.NOTION_CLIENT_SECRET

    const response = await GET(request)

    expect(response.headers.get('location')).toContain('error=notion_not_configured')
    expect(setCookie).not.toHaveBeenCalled()
  })
})
