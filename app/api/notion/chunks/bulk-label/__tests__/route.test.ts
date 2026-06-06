/**
 * @jest-environment node
 */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    notionChunk: { findMany: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockChunkFindMany = jest.mocked(prisma.notionChunk.findMany)
const mockChunkUpdate = jest.mocked(prisma.notionChunk.update)
const mockTrackEvent = jest.mocked(trackEvent)

const CLERK_ID = 'clerk-1'
const WORKSPACE_ID = 'ws-1'
const DISPLAY_NAME = 'Ali Z'

const SAMPLE_CHUNKS = [
  { id: 'chunk-1', workspaceId: WORKSPACE_ID, labels: [], labeledBy: [], notionPageId: 'page-1' },
  { id: 'chunk-2', workspaceId: WORKSPACE_ID, labels: ['rule'], labeledBy: [], notionPageId: 'page-1' },
]

function authed(userId = CLERK_ID) {
  mockAuth.mockResolvedValue({ userId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
}

function withMember(role = 'member') {
  mockMemberFind.mockResolvedValue({ role, status: 'active', displayName: DISPLAY_NAME } as never)
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/notion/chunks/bulk-label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  workspaceId: WORKSPACE_ID,
  chunkIds: ['chunk-1', 'chunk-2'],
  labels: ['decision'],
  action: 'add' as const,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUserFind.mockResolvedValue({ workspace: { id: WORKSPACE_ID } } as never)
  mockChunkFindMany.mockResolvedValue(SAMPLE_CHUNKS as never)
  mockChunkUpdate.mockResolvedValue({} as never)
  mockTrackEvent.mockResolvedValue(undefined)
})

describe('POST /api/notion/chunks/bulk-label', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not a workspace member', async () => {
    authed()
    mockMemberFind.mockResolvedValue(null as never)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(403)
  })

  it('returns 403 when user has viewer role', async () => {
    authed()
    withMember('viewer')
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(403)
  })

  it('returns 400 when chunkIds is missing', async () => {
    authed()
    withMember()
    const res = await POST(makeRequest({ ...validBody, chunkIds: undefined }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when labels is empty', async () => {
    authed()
    withMember()
    const res = await POST(makeRequest({ ...validBody, labels: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when action is invalid', async () => {
    authed()
    withMember()
    const res = await POST(makeRequest({ ...validBody, action: 'replace' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when chunkIds is empty', async () => {
    authed()
    withMember()
    const res = await POST(makeRequest({ ...validBody, chunkIds: [] }))
    expect(res.status).toBe(400)
  })

  it('adds labels to all specified chunks', async () => {
    authed()
    withMember()
    await POST(makeRequest(validBody))
    expect(mockChunkUpdate).toHaveBeenCalledTimes(2)
    expect(mockChunkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          labels: expect.arrayContaining(['decision']),
        }),
      }),
    )
  })

  it('only updates chunks belonging to the workspace', async () => {
    authed()
    withMember()
    await POST(makeRequest(validBody))
    expect(mockChunkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          id: { in: ['chunk-1', 'chunk-2'] },
        }),
      }),
    )
  })

  it('returns updated count and syncedBy displayName', async () => {
    authed()
    withMember()
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(2)
    expect(body.by).toBe(DISPLAY_NAME)
  })

  it('removes labels from chunks when action is "remove"', async () => {
    authed()
    withMember()
    const removeChunk = { ...SAMPLE_CHUNKS[1] } // has labels: ['rule']
    mockChunkFindMany.mockResolvedValue([removeChunk] as never)
    await POST(makeRequest({ ...validBody, chunkIds: ['chunk-2'], labels: ['rule'], action: 'remove' }))
    const updateCall = mockChunkUpdate.mock.calls[0][0]
    const labels = updateCall.data.labels as string[]
    expect(labels).not.toContain('rule')
  })

  it('applies optional visibility to all chunks', async () => {
    authed()
    withMember()
    await POST(makeRequest({ ...validBody, visibility: 'personal' }))
    expect(mockChunkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: 'personal', visibilitySetBy: CLERK_ID }),
      }),
    )
  })

  it('creates an ActivityEvent with bulk label info', async () => {
    authed()
    withMember()
    await POST(makeRequest(validBody))
    expect(mockTrackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CLERK_ID,
      DISPLAY_NAME,
      'label',
      expect.stringContaining('decision'),
      expect.any(Object),
    )
  })

  it('returns 500 on unexpected database error', async () => {
    authed()
    withMember()
    mockChunkUpdate.mockRejectedValue(new Error('DB error'))
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(500)
  })
})
