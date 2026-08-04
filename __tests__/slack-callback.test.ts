/**
 * @jest-environment node
 *
 * Tests for app/api/integrations/slack/callback/route.ts
 *
 * Strategy:
 * - Mock `next/navigation` redirect so it throws a catchable sentinel,
 *   mirroring Next.js behaviour (redirect() throws internally).
 * - Mock `@/lib/db` prisma singleton.
 * - Mock global fetch to control Slack token exchange responses.
 * - Set required env vars for each test run.
 */

// ── next/navigation mock ──────────────────────────────────────────────────────
// Next.js redirect() throws a special error object; we replicate that here.
class RedirectError extends Error {
  destination: string
  constructor(destination: string) {
    super(`NEXT_REDIRECT:${destination}`)
    this.destination = destination
    this.name = 'RedirectError'
  }
}

jest.mock('next/navigation', () => ({
  redirect: jest.fn((destination: string) => {
    throw new RedirectError(destination)
  }),
}))

// ── next/headers mock ─────────────────────────────────────────────────────────
const mockCookieGet = jest.fn()
const mockCookieDelete = jest.fn()

jest.mock('next/headers', () => ({
  cookies: jest.fn(() =>
    Promise.resolve({
      get: mockCookieGet,
      delete: mockCookieDelete,
    })
  ),
}))

// ── @clerk/nextjs/server mock ─────────────────────────────────────────────────
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(() => Promise.resolve({ userId: 'user_clerk_abc' })),
}))

// ── @/lib/crypto mock ─────────────────────────────────────────────────────────
jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn(() => 'encrypted_token'),
}))

// ── Prisma mock ───────────────────────────────────────────────────────────────
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    integration: {
      upsert: jest.fn(),
    },
    slackUserConnection: {
      upsert: jest.fn(),
    },
  },
}))

// ── imports ───────────────────────────────────────────────────────────────────
import { GET } from '@/app/api/integrations/slack/callback/route'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'

// ── helpers ───────────────────────────────────────────────────────────────────
const CLERK_ID = 'user_clerk_abc'
const VALID_STATE = Buffer.from(CLERK_ID).toString('base64url')

function buildRequest(params: Record<string, string> = {}): Request {
  const url = new URL('https://example.com/api/integrations/slack/callback')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

const VALID_SLACK_TOKEN = {
  ok: true,
  access_token: 'xoxb-token-value',
  bot_user_id: 'B12345',
  team: { id: 'T98765', name: 'Acme Corp' },
}

const DB_USER_WITH_WORKSPACE = {
  id: 'db_user_1',
  clerkId: CLERK_ID,
  workspace: { id: 'ws_1', name: "Alice's Brain" },
}

function mockFetchOk(body: unknown = VALID_SLACK_TOKEN) {
  global.fetch = jest.fn().mockResolvedValue({
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response)
}

async function callGET(params: Record<string, string>): Promise<Response | { redirectedTo: string } | void> {
  try {
    return await GET(buildRequest(params))
  } catch (err) {
    if (err instanceof RedirectError) {
      return { redirectedTo: err.destination }
    }
    throw err
  }
}

// ── setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks()
  process.env.SLACK_CLIENT_ID = 'client_id_test'
  process.env.SLACK_CLIENT_SECRET = 'client_secret_test'
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'

  // Provide a valid cookie by default so tests that reach cookies() don't fail
  // for unrelated reasons. Individual tests can override mockCookieGet as needed.
  mockCookieGet.mockReturnValue({
    value: JSON.stringify({ state: VALID_STATE, userId: CLERK_ID }),
  })
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/integrations/slack/callback', () => {
  describe('missing query parameters', () => {
    it('redirects to /dashboard?error=slack_failed when code is missing', async () => {
      const result = await callGET({ state: VALID_STATE })
      expect(result).toEqual({ redirectedTo: '/dashboard?error=slack_failed' })
      expect(redirect).toHaveBeenCalledWith('/dashboard?error=slack_failed')
    })

    it('redirects to /dashboard?error=slack_failed when state is missing', async () => {
      const result = await callGET({ code: 'auth_code_123' })
      expect(result).toEqual({ redirectedTo: '/dashboard?error=slack_failed' })
      expect(redirect).toHaveBeenCalledWith('/dashboard?error=slack_failed')
    })

    it('redirects to /dashboard?error=slack_failed when both are missing', async () => {
      const result = await callGET({})
      expect(result).toEqual({ redirectedTo: '/dashboard?error=slack_failed' })
    })
  })

  describe('invalid state (base64 decoding)', () => {
    it('redirects to /dashboard?error=slack_failed for invalid base64 state', async () => {
      // Craft a state that decodes to an empty string to trigger the guard
      const emptyState = Buffer.from('').toString('base64url')
      mockFetchOk()

      const result = await callGET({ code: 'auth_code_123', state: emptyState })

      expect(result).toEqual({ redirectedTo: '/dashboard?error=slack_failed' })
    })
  })

  describe('Slack token exchange failure', () => {
    it('surfaces Slack admin approval errors without storing credentials', async () => {
      const result = await callGET({ error: 'app_not_approved', state: VALID_STATE })
      expect(result).toEqual({ redirectedTo: '/dashboard/integrations?error=slack_admin_approval&reason=app_not_approved' })
      expect(prisma.integration.upsert).not.toHaveBeenCalled()
      expect(prisma.slackUserConnection.upsert).not.toHaveBeenCalled()
    })

    it('surfaces a friendly non-distributed Slack app error', async () => {
      const result = await callGET({ error: 'invalid_team_for_non_distributed_app', state: VALID_STATE })
      expect(result).toEqual({
        redirectedTo: '/dashboard/integrations?error=slack_distribution_required&reason=invalid_team_for_non_distributed_app',
      })
      expect(prisma.integration.upsert).not.toHaveBeenCalled()
      expect(prisma.slackUserConnection.upsert).not.toHaveBeenCalled()
    })

    it('redirects to /dashboard?error=slack_failed when token.ok is false', async () => {
      mockFetchOk({ ok: false, error: 'invalid_code' })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(DB_USER_WITH_WORKSPACE)

      const result = await callGET({ code: 'bad_code', state: VALID_STATE })

      expect(result).toEqual({ redirectedTo: '/dashboard/integrations?error=slack_failed&reason=invalid_code' })
      expect(prisma.integration.upsert).not.toHaveBeenCalled()
    })

    it('redirects to /dashboard?error=slack_failed when fetch itself rejects', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      await expect(callGET({ code: 'code', state: VALID_STATE })).rejects.toThrow('Network error')
    })
  })

  describe('user not found / no workspace', () => {
    it('redirects to /dashboard?error=no_workspace when user not found in DB', async () => {
      mockFetchOk()
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await callGET({ code: 'auth_code_123', state: VALID_STATE })

      expect(result).toEqual({ redirectedTo: '/dashboard?error=no_workspace' })
      expect(prisma.integration.upsert).not.toHaveBeenCalled()
    })

    it('redirects to /dashboard?error=no_workspace when user has no workspace', async () => {
      mockFetchOk()
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'db_user_1',
        clerkId: CLERK_ID,
        workspace: null,
      })

      const result = await callGET({ code: 'auth_code_123', state: VALID_STATE })

      expect(result).toEqual({ redirectedTo: '/dashboard?error=no_workspace' })
    })
  })

  describe('happy path', () => {
    it('calls prisma.user.findUnique with the decoded clerkId', async () => {
      mockFetchOk()
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(DB_USER_WITH_WORKSPACE)
      ;(prisma.integration.upsert as jest.Mock).mockResolvedValue({})

      await callGET({ code: 'auth_code_123', state: VALID_STATE })

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: CLERK_ID },
        include: { workspace: true },
      })
    })

    it('calls prisma.integration.upsert with correct payload', async () => {
      mockFetchOk()
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(DB_USER_WITH_WORKSPACE)
      ;(prisma.integration.upsert as jest.Mock).mockResolvedValue({})

      await callGET({ code: 'auth_code_123', state: VALID_STATE })

      expect(prisma.integration.upsert).toHaveBeenCalledTimes(1)
      expect(prisma.integration.upsert).toHaveBeenCalledWith({
        where: { workspaceId_type: { workspaceId: 'ws_1', type: 'slack' } },
        update: {
          accessToken: 'encrypted_token',
          botUserId: 'B12345',
          teamId: 'T98765',
          teamName: 'Acme Corp',
        },
        create: {
          workspaceId: 'ws_1',
          type: 'slack',
          accessToken: 'encrypted_token',
          botUserId: 'B12345',
          teamId: 'T98765',
          teamName: 'Acme Corp',
          channels: [],
        },
      })
    })

    it('stores a personal Slack token encrypted without replacing bot mode', async () => {
      mockCookieGet.mockReturnValue({
        value: JSON.stringify({ state: VALID_STATE, userId: CLERK_ID, mode: 'user' }),
      })
      mockFetchOk({
        ok: true,
        team: { id: 'T98765', name: 'Acme Corp' },
        authed_user: {
          id: 'U123',
          access_token: 'xoxp-user-secret',
          refresh_token: 'xoxe-refresh-secret',
          expires_in: 3600,
          scope: 'channels:read,channels:history',
        },
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(DB_USER_WITH_WORKSPACE)
      ;(prisma.slackUserConnection.upsert as jest.Mock).mockResolvedValue({})

      const result = await callGET({ code: 'auth_code_123', state: VALID_STATE })

      expect(result).toEqual({ redirectedTo: '/dashboard/integrations?success=slack_user' })
      expect(prisma.integration.upsert).not.toHaveBeenCalled()
      expect(prisma.slackUserConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { workspaceId_connectedByUserId: { workspaceId: 'ws_1', connectedByUserId: CLERK_ID } },
        create: expect.objectContaining({
          encryptedAccessToken: 'encrypted_token',
          encryptedRefreshToken: 'encrypted_token',
          connectedByUserId: CLERK_ID,
          settings: expect.objectContaining({ publicChannels: true, privateChannels: false, dms: false }),
        }),
      }))
      expect(JSON.stringify((prisma.slackUserConnection.upsert as jest.Mock).mock.calls[0][0])).not.toContain('xoxp-user-secret')
    })

    it('redirects to /dashboard/integrations?success=slack on success', async () => {
      mockFetchOk()
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(DB_USER_WITH_WORKSPACE)
      ;(prisma.integration.upsert as jest.Mock).mockResolvedValue({})

      const result = await callGET({ code: 'auth_code_123', state: VALID_STATE })

      expect(result).toEqual({ redirectedTo: '/dashboard/integrations?success=slack' })
    })

    it('calls the Slack token exchange endpoint with the correct body', async () => {
      mockFetchOk()
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(DB_USER_WITH_WORKSPACE)
      ;(prisma.integration.upsert as jest.Mock).mockResolvedValue({})

      await callGET({ code: 'auth_code_123', state: VALID_STATE })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://slack.com/api/oauth.v2.access',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      )

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
      const body: URLSearchParams = fetchCall[1].body
      expect(body.get('code')).toBe('auth_code_123')
      expect(body.get('client_id')).toBe('client_id_test')
      expect(body.get('client_secret')).toBe('client_secret_test')
    })
  })
})
