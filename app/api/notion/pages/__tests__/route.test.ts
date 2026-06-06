/**
 * @jest-environment node
 */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn(), findMany: jest.fn() },
    notionPage: { findMany: jest.fn(), count: jest.fn() },
    notionChunk: { findMany: jest.fn() },
  },
}))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockMemberFindMany = jest.mocked(prisma.workspaceMember.findMany)
const mockPagesFindMany = jest.mocked(prisma.notionPage.findMany)
const mockPagesCount = jest.mocked(prisma.notionPage.count)
const mockChunkFindMany = jest.mocked(prisma.notionChunk.findMany)
const mockTrackEvent = jest.mocked(trackEvent)

const CLERK_ID = 'clerk-1'
const WORKSPACE_ID = 'ws-1'
const DISPLAY_NAME = 'Ali Z'

const SAMPLE_PAGES_WITH_COUNT = [
  {
    id: 'page-1',
    notionPageId: 'notion-abc',
    workspaceId: WORKSPACE_ID,
    title: 'Design Doc',
    parentPageId: null,
    iconUrl: null,
    lastEditedAt: new Date('2025-01-01'),
    syncedBy: CLERK_ID,
    syncedAt: new Date('2025-01-02'),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
    _count: { chunks: 5 },
  },
]

const SAMPLE_CHUNKS = [
  { notionPageId: 'page-1', labels: ['rule', 'decision'] },
  { notionPageId: 'page-1', labels: [] },
]

function authed(userId = CLERK_ID) {
  mockAuth.mockResolvedValue({ userId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
}

function withMember(role = 'member') {
  mockMemberFind.mockResolvedValue({ role, status: 'active', displayName: DISPLAY_NAME } as never)
}

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/notion/pages')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUserFind.mockResolvedValue({ workspace: { id: WORKSPACE_ID } } as never)
  mockPagesFindMany.mockResolvedValue(SAMPLE_PAGES_WITH_COUNT as never)
  mockPagesCount.mockResolvedValue(1)
  mockChunkFindMany.mockResolvedValue(SAMPLE_CHUNKS as never)
  mockMemberFindMany.mockResolvedValue([{ userId: CLERK_ID, displayName: DISPLAY_NAME }] as never)
  mockTrackEvent.mockResolvedValue(undefined)
})

describe('GET /api/notion/pages', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when no workspaceId and user has no workspace', async () => {
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

  it('returns 200 with pages array and page-based meta', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toMatchObject({ total: 1, page: 1, limit: 20 })
  })

  it('paginates with page param (1-based)', async () => {
    authed()
    withMember()
    await GET(makeRequest({ workspaceId: WORKSPACE_ID, page: '2', limit: '10' }))
    expect(mockPagesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 10 }),
    )
  })

  it('returns correct meta with page and limit', async () => {
    authed()
    withMember()
    mockPagesCount.mockResolvedValue(42)
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID, page: '3', limit: '10' }))
    const body = await res.json()
    expect(body.meta).toEqual({ total: 42, page: 3, limit: 10 })
  })

  it('resolves workspaceId from user record when not in query', async () => {
    authed()
    withMember('admin')
    await GET(makeRequest())
    expect(mockPagesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WORKSPACE_ID }) }),
    )
  })

  it('filters pages by title when search param provided', async () => {
    authed()
    withMember()
    await GET(makeRequest({ workspaceId: WORKSPACE_ID, search: 'deploy' }))
    expect(mockPagesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          title: expect.objectContaining({ contains: 'deploy' }),
        }),
      }),
    )
  })

  it('includes chunkCount in each page item', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    const body = await res.json()
    expect(body.data[0]).toHaveProperty('chunkCount', 5)
  })

  it('includes labeledChunkCount in each page item', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    const body = await res.json()
    // 1 of 2 chunks has labels (non-empty array)
    expect(body.data[0]).toHaveProperty('labeledChunkCount', 1)
  })

  it('includes syncedByName resolved from member display name', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    const body = await res.json()
    expect(body.data[0].syncedByName).toBe(DISPLAY_NAME)
  })

  it('filters pages by team visibility: only pages with team chunks OR owned by requester', async () => {
    authed()
    withMember()
    await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(mockPagesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ syncedBy: CLERK_ID }),
            expect.objectContaining({ chunks: expect.any(Object) }),
          ]),
        }),
      }),
    )
  })

  it('sorts pages by lastEditedAt descending', async () => {
    authed()
    withMember()
    await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(mockPagesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { lastEditedAt: 'desc' } }),
    )
  })

  it('fires a page_viewed activity event', async () => {
    authed()
    withMember()
    await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(mockTrackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID, CLERK_ID, DISPLAY_NAME, 'page_viewed', expect.any(String), expect.any(Object),
    )
  })

  it('permits owner, admin, and member roles', async () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      jest.clearAllMocks()
      authed()
      mockPagesFindMany.mockResolvedValue([] as never)
      mockPagesCount.mockResolvedValue(0)
      mockChunkFindMany.mockResolvedValue([] as never)
      mockMemberFindMany.mockResolvedValue([] as never)
      mockTrackEvent.mockResolvedValue(undefined)
      withMember(role)
      const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
      expect(res.status).toBe(200)
    }
  })

  it('returns 500 on database error', async () => {
    authed()
    withMember()
    mockPagesFindMany.mockRejectedValue(new Error('DB error'))
    const res = await GET(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(500)
  })
})
