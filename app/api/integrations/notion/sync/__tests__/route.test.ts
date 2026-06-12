/**
 * @jest-environment node
 */
import { maxDuration, POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { syncNotionPages } from '@/lib/notion/sync'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    integration: { upsert: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/notion/sync', () => ({ syncNotionPages: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockIntegrationUpsert = jest.mocked(prisma.integration.upsert)
const mockIntegrationUpdate = jest.mocked(prisma.integration.update)
const mockSync = jest.mocked(syncNotionPages)

const CLERK_ID = 'clerk-1'
const WORKSPACE_ID = 'ws-1'
const DISPLAY_NAME = 'Ali Z'
const DEFAULT_SYNC_RESULT = { pages: 5, chunks: 47, skipped: 2, failed: [] as string[] }

function authed(userId = CLERK_ID) {
  mockAuth.mockResolvedValue({ userId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
}

function withMember(role = 'member', displayName = DISPLAY_NAME) {
  mockMemberFind.mockResolvedValue({ role, status: 'active', displayName } as never)
}

function makeRequest(body?: object) {
  return new Request('http://localhost/api/integrations/notion/sync', {
    method: 'POST',
    ...(body
      ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockIntegrationUpsert.mockResolvedValue({} as never)
  mockIntegrationUpdate.mockResolvedValue({} as never)
  mockSync.mockResolvedValue(DEFAULT_SYNC_RESULT)
  mockUserFind.mockResolvedValue({ workspace: { id: WORKSPACE_ID } } as never)
})

describe('POST /api/integrations/notion/sync', () => {
  it('allows enough runtime for Notion API, embedding, and Pinecone writes', () => {
    expect(maxDuration).toBe(120)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workspace cannot be resolved', async () => {
    authed()
    mockUserFind.mockResolvedValue(null as never)
    const res = await POST(makeRequest()) // no workspaceId in body → falls back → 404
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not an active workspace member', async () => {
    authed()
    mockMemberFind.mockResolvedValue(null as never)
    const res = await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when user has viewer role', async () => {
    authed()
    withMember('viewer')
    const res = await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(403)
  })

  it('calls syncNotionPages with workspaceId, clerkId, and displayName', async () => {
    authed()
    withMember('member')
    await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(mockSync).toHaveBeenCalledWith(WORKSPACE_ID, CLERK_ID, DISPLAY_NAME)
  })

  it('resolves workspaceId from user record when not in body', async () => {
    authed()
    withMember('owner')
    await POST(makeRequest())
    expect(mockSync).toHaveBeenCalledWith(WORKSPACE_ID, CLERK_ID, expect.any(String))
  })

  it('returns success shape with pagesProcessed and chunksCreated', async () => {
    authed()
    withMember('member')
    mockSync.mockResolvedValue({ pages: 10, chunks: 82, skipped: 3, failed: [] })
    const res = await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      success: true,
      pagesProcessed: 10,
      chunksCreated: 82,
      syncedBy: DISPLAY_NAME,
    })
  })

  it('includes failed page ids in response', async () => {
    authed()
    withMember('member')
    mockSync.mockResolvedValue({ pages: 3, chunks: 20, skipped: 0, failed: ['page-bad'] })
    const res = await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
    const body = await res.json()
    expect(body.failed).toEqual(['page-bad'])
  })

  it('upserts notion integration record for the workspace', async () => {
    authed()
    withMember('member')
    await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(mockIntegrationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_type: { workspaceId: WORKSPACE_ID, type: 'notion' } },
      }),
    )
  })

  it('updates lastSyncAt on integration after successful sync', async () => {
    authed()
    withMember('member')
    await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(mockIntegrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_type: { workspaceId: WORKSPACE_ID, type: 'notion' } },
        data: expect.objectContaining({ lastSyncAt: expect.any(Date) }),
      }),
    )
  })

  it('permits owner, admin, and member roles', async () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      jest.clearAllMocks()
      authed()
      mockIntegrationUpsert.mockResolvedValue({} as never)
      mockIntegrationUpdate.mockResolvedValue({} as never)
      mockSync.mockResolvedValue(DEFAULT_SYNC_RESULT)
      withMember(role)
      const res = await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
      expect(res.status).toBe(200)
    }
  })

  it('returns 500 on unexpected sync error', async () => {
    authed()
    withMember('member')
    mockSync.mockRejectedValue(new Error('Notion API down'))
    const res = await POST(makeRequest({ workspaceId: WORKSPACE_ID }))
    expect(res.status).toBe(500)
  })
})
