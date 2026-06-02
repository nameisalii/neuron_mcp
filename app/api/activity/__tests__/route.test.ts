/**
 * @jest-environment node
 */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    workspace: { findUnique: jest.fn() },
    activityEvent: { findMany: jest.fn(), count: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockWorkspaceFind = jest.mocked(prisma.workspace.findUnique)
const mockEventsFindMany = jest.mocked(prisma.activityEvent.findMany)
const mockEventsCount = jest.mocked(prisma.activityEvent.count)

const CLERK_ID = 'clerk-1'
const WORKSPACE_ID = 'ws-1'
const DISPLAY_NAME = 'Ali Z'

const SAMPLE_EVENTS = [
  {
    id: 'evt-1',
    workspaceId: WORKSPACE_ID,
    userId: CLERK_ID,
    displayName: DISPLAY_NAME,
    eventType: 'sync',
    description: 'Synced 10 pages',
    metadata: null,
    createdAt: new Date('2025-06-01T10:00:00Z'),
  },
]

function authed(userId = CLERK_ID) {
  mockAuth.mockResolvedValue({ userId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
}

function withMember(role = 'member') {
  mockMemberFind.mockResolvedValue({ role, status: 'active', displayName: DISPLAY_NAME } as never)
}

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/activity')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUserFind.mockResolvedValue({ workspace: { id: WORKSPACE_ID } } as never)
  mockWorkspaceFind.mockResolvedValue({ id: WORKSPACE_ID, type: 'team', ownerId: CLERK_ID } as never)
  mockEventsFindMany.mockResolvedValue(SAMPLE_EVENTS as never)
  mockEventsCount.mockResolvedValue(1)
})

describe('GET /api/activity', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workspaceId not provided and user has no workspace', async () => {
    authed()
    mockUserFind.mockResolvedValue(null as never)
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not a workspace member', async () => {
    authed()
    mockMemberFind.mockResolvedValue(null as never)
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when user has viewer role', async () => {
    authed()
    withMember('viewer')
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 200 with events and meta on happy path', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toMatchObject({ total: 1, page: 1, limit: 30 })
  })

  it('resolves workspaceId from user record when not in query', async () => {
    authed()
    withMember('admin')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(mockEventsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WORKSPACE_ID }) }),
    )
  })

  it('paginates with page and limit params', async () => {
    authed()
    withMember()
    await GET(makeRequest({ workspaceId: WORKSPACE_ID, page: '2', limit: '10' }))
    expect(mockEventsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 10 }),
    )
  })

  it('returns correct meta with page and limit', async () => {
    authed()
    withMember()
    mockEventsCount.mockResolvedValue(42)
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID, page: '3', limit: '10' }))
    const body = await res.json()
    expect(body.meta).toEqual({ total: 42, page: 3, limit: 10 })
  })

  it('filters by eventType when provided', async () => {
    authed()
    withMember()
    await GET(makeRequest({ workspaceId: WORKSPACE_ID, eventType: 'sync' }))
    expect(mockEventsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventType: 'sync' }),
      }),
    )
  })

  it('filters by userId when provided', async () => {
    authed()
    withMember()
    await GET(makeRequest({ workspaceId: WORKSPACE_ID, userId: 'clerk-2' }))
    expect(mockEventsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'clerk-2' }),
      }),
    )
  })

  it('orders events by createdAt descending', async () => {
    authed()
    withMember()
    await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(mockEventsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    )
  })

  it('forces userId filter to self in solo workspaces', async () => {
    authed()
    withMember('owner')
    mockWorkspaceFind.mockResolvedValue({ id: WORKSPACE_ID, type: 'solo', ownerId: CLERK_ID } as never)
    await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(mockEventsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: CLERK_ID }),
      }),
    )
  })

  it('does not force userId filter in team workspaces', async () => {
    authed()
    withMember()
    mockWorkspaceFind.mockResolvedValue({ id: WORKSPACE_ID, type: 'team', ownerId: 'clerk-owner' } as never)
    await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    const call = mockEventsFindMany.mock.calls[0]![0]!
    expect(call.where).not.toHaveProperty('userId')
  })

  it('permits owner, admin, and member roles', async () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      jest.clearAllMocks()
      authed()
      mockWorkspaceFind.mockResolvedValue({ id: WORKSPACE_ID, type: 'team', ownerId: 'clerk-owner' } as never)
      mockEventsFindMany.mockResolvedValue([] as never)
      mockEventsCount.mockResolvedValue(0)
      withMember(role)
      const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
      expect(res.status).toBe(200)
    }
  })

  it('returns 500 on database error', async () => {
    authed()
    withMember()
    mockEventsFindMany.mockRejectedValue(new Error('DB error'))
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(500)
  })
})
