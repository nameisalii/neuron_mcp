/**
 * @jest-environment node
 *
 * Tests for app/api/webhooks/clerk/route.ts
 *
 * Strategy:
 * - Mock `next/headers` so the route can be imported in Jest (Node env).
 * - Mock `svix` Webhook class to control verify() behaviour.
 * - Mock `@/lib/db` prisma singleton to avoid real DB calls.
 * - Mock `CLERK_WEBHOOK_SECRET` via process.env.
 */

import { POST } from '@/app/api/webhooks/clerk/route'

// ── Prisma mock ───────────────────────────────────────────────────────────────
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { create: jest.fn(), upsert: jest.fn() },
    workspace: { upsert: jest.fn() },
    workspaceMember: { upsert: jest.fn() },
  },
}))

// ── next/headers mock ─────────────────────────────────────────────────────────
// next/headers is a server-only module; we must shim it for Jest.
const mockHeadersGet = jest.fn()
jest.mock('next/headers', () => ({
  headers: jest.fn(() => ({ get: mockHeadersGet })),
}))

// ── svix mock ─────────────────────────────────────────────────────────────────
const mockVerify = jest.fn()
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({ verify: mockVerify })),
}))

// ── helpers ───────────────────────────────────────────────────────────────────
import { prisma } from '@/lib/db'

const VALID_SVIX_HEADERS = {
  'svix-id': 'msg_test_id',
  'svix-timestamp': '1700000000',
  'svix-signature': 'v1,validSignature',
}

function buildRequest(body: unknown, extraHeaders: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/webhooks/clerk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  })
}

function setMockHeaders(overrides: Partial<typeof VALID_SVIX_HEADERS> | null = {}) {
  if (overrides === null) {
    // Simulate all svix headers missing
    mockHeadersGet.mockReturnValue(null)
    return
  }
  const merged = { ...VALID_SVIX_HEADERS, ...overrides }
  mockHeadersGet.mockImplementation((key: string) => merged[key as keyof typeof merged] ?? null)
}

const USER_CREATED_EVENT = {
  type: 'user.created',
  data: {
    id: 'user_clerk_123',
    email_addresses: [{ email_address: 'alice@example.com' }],
    first_name: 'Alice',
    last_name: 'Smith',
  },
}

// ── setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks()
  process.env.CLERK_WEBHOOK_SECRET = 'whsec_test_secret'
  // Default: valid verify returns the event
  mockVerify.mockReturnValue(USER_CREATED_EVENT)
  setMockHeaders()
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/clerk', () => {
  describe('missing svix headers', () => {
    it('returns 400 when all svix headers are absent', async () => {
      setMockHeaders(null)
      const req = buildRequest({ type: 'user.created' })

      const res = await POST(req)

      expect(res.status).toBe(400)
      expect(await res.text()).toMatch(/missing svix headers/i)
    })

    it('returns 400 when svix-id is missing', async () => {
      mockHeadersGet.mockImplementation((key: string) =>
        key === 'svix-id' ? null : VALID_SVIX_HEADERS[key as keyof typeof VALID_SVIX_HEADERS]
      )
      const res = await POST(buildRequest(USER_CREATED_EVENT))
      expect(res.status).toBe(400)
    })

    it('returns 400 when svix-timestamp is missing', async () => {
      mockHeadersGet.mockImplementation((key: string) =>
        key === 'svix-timestamp' ? null : VALID_SVIX_HEADERS[key as keyof typeof VALID_SVIX_HEADERS]
      )
      const res = await POST(buildRequest(USER_CREATED_EVENT))
      expect(res.status).toBe(400)
    })

    it('returns 400 when svix-signature is missing', async () => {
      mockHeadersGet.mockImplementation((key: string) =>
        key === 'svix-signature' ? null : VALID_SVIX_HEADERS[key as keyof typeof VALID_SVIX_HEADERS]
      )
      const res = await POST(buildRequest(USER_CREATED_EVENT))
      expect(res.status).toBe(400)
    })
  })

  describe('invalid signature', () => {
    it('returns 400 when svix verify() throws', async () => {
      mockVerify.mockImplementation(() => {
        throw new Error('Invalid signature')
      })

      const res = await POST(buildRequest(USER_CREATED_EVENT))

      expect(res.status).toBe(400)
      expect(await res.text()).toMatch(/invalid webhook signature/i)
    })
  })

  describe('user.created — happy path', () => {
    it('calls prisma.user.upsert with correct data and returns 200', async () => {
      const mockUserUpsert = prisma.user.upsert as jest.Mock
      const mockWorkspaceUpsert = (prisma.workspace as jest.Mocked<typeof prisma.workspace>).upsert as jest.Mock
      mockUserUpsert.mockResolvedValue({ id: 'db_user_1' })
      mockWorkspaceUpsert.mockResolvedValue({ id: 'ws_1' })

      const res = await POST(buildRequest(USER_CREATED_EVENT))

      expect(res.status).toBe(200)
      expect(mockUserUpsert).toHaveBeenCalledWith({
        where: { clerkId: 'user_clerk_123' },
        update: {},
        create: { clerkId: 'user_clerk_123', email: 'alice@example.com', name: 'Alice Smith' },
      })
    })

    it('uses fallback workspace name when user has no name', async () => {
      const eventNoName = {
        type: 'user.created',
        data: {
          id: 'user_clerk_456',
          email_addresses: [{ email_address: 'anon@example.com' }],
          first_name: null,
          last_name: null,
        },
      }
      mockVerify.mockReturnValue(eventNoName)
      const mockUserUpsert = prisma.user.upsert as jest.Mock
      const mockWorkspaceUpsert = (prisma.workspace as jest.Mocked<typeof prisma.workspace>).upsert as jest.Mock
      mockUserUpsert.mockResolvedValue({ id: 'db_user_2' })
      mockWorkspaceUpsert.mockResolvedValue({ id: 'ws_2' })

      const res = await POST(buildRequest(eventNoName))

      expect(res.status).toBe(200)
      expect(mockUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ name: null }) }),
      )
    })

    it('upserts a Workspace row linked to the user', async () => {
      const mockUserUpsert = prisma.user.upsert as jest.Mock
      const mockWorkspaceUpsert = (prisma.workspace as jest.Mocked<typeof prisma.workspace>).upsert as jest.Mock
      mockUserUpsert.mockResolvedValue({ id: 'db_user_3' })
      mockWorkspaceUpsert.mockResolvedValue({ id: 'ws_3' })

      await POST(buildRequest(USER_CREATED_EVENT))

      expect(mockWorkspaceUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ ownerId: 'db_user_3' }) }),
      )
    })
  })

  describe('user.created — missing email', () => {
    it('returns 400 when email_addresses array is empty', async () => {
      const eventNoEmail = {
        type: 'user.created',
        data: {
          id: 'user_clerk_789',
          email_addresses: [],
          first_name: 'Bob',
          last_name: 'Jones',
        },
      }
      mockVerify.mockReturnValue(eventNoEmail)

      const res = await POST(buildRequest(eventNoEmail))

      expect(res.status).toBe(400)
      expect(await res.text()).toMatch(/no email address/i)
      expect(prisma.user.upsert).not.toHaveBeenCalled()
    })

    it('returns 400 when email_address field is an empty string', async () => {
      const eventEmptyEmail = {
        type: 'user.created',
        data: {
          id: 'user_clerk_000',
          email_addresses: [{ email_address: '' }],
          first_name: 'Eve',
          last_name: null,
        },
      }
      mockVerify.mockReturnValue(eventEmptyEmail)

      const res = await POST(buildRequest(eventEmptyEmail))

      expect(res.status).toBe(400)
      expect(prisma.user.upsert).not.toHaveBeenCalled()
    })
  })

  describe('non-user.created events', () => {
    it('returns 200 without touching Prisma for other event types', async () => {
      const otherEvent = { type: 'user.updated', data: { id: 'x' } }
      mockVerify.mockReturnValue(otherEvent)

      const res = await POST(buildRequest(otherEvent))

      expect(res.status).toBe(200)
      expect(prisma.user.upsert).not.toHaveBeenCalled()
    })
  })
})
