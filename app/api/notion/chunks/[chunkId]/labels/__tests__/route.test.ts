/**
 * @jest-environment node
 */
import { PATCH } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    workspaceMember: { findUnique: jest.fn() },
    notionChunk: { findUnique: jest.fn(), update: jest.fn() },
    notionPage: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockChunkFind = jest.mocked(prisma.notionChunk.findUnique)
const mockChunkUpdate = jest.mocked(prisma.notionChunk.update)
const mockPageFind = jest.mocked(prisma.notionPage.findUnique)
const mockTrackEvent = jest.mocked(trackEvent)

const CLERK_ID = 'clerk-1'
const WORKSPACE_ID = 'ws-1'
const CHUNK_ID = 'chunk-1'
const PAGE_ID = 'page-1'
const DISPLAY_NAME = 'Ali Z'

const SAMPLE_CHUNK = {
  id: CHUNK_ID,
  workspaceId: WORKSPACE_ID,
  notionPageId: PAGE_ID,
  content: 'Some content',
  blockType: 'paragraph',
  position: 0,
  labels: [] as string[],
  labeledBy: [] as object[],
  visibility: 'team',
  visibilitySetBy: null,
  pineconeId: 'pin-1',
  metadata: {},
}

const SAMPLE_PAGE = {
  id: PAGE_ID,
  title: 'Deployment Guide',
  workspaceId: WORKSPACE_ID,
}

function authed(userId = CLERK_ID) {
  mockAuth.mockResolvedValue({ userId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
}

function withMember(role = 'member') {
  mockMemberFind.mockResolvedValue({ role, status: 'active', displayName: DISPLAY_NAME } as never)
}

function makeRequest(chunkId: string, body: object) {
  return new Request(`http://localhost/api/notion/chunks/${chunkId}/labels`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockChunkFind.mockResolvedValue(SAMPLE_CHUNK as never)
  mockChunkUpdate.mockResolvedValue({ ...SAMPLE_CHUNK, labels: ['rule'] } as never)
  mockPageFind.mockResolvedValue(SAMPLE_PAGE as never)
  mockTrackEvent.mockResolvedValue(undefined)
})

describe('PATCH /api/notion/chunks/[chunkId]/labels', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when chunk does not exist', async () => {
    authed()
    withMember()
    mockChunkFind.mockResolvedValue(null as never)
    const res = await PATCH(makeRequest('bad-id', { labels: ['rule'] }), { params: Promise.resolve({ chunkId: 'bad-id' }) })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not a workspace member', async () => {
    authed()
    mockMemberFind.mockResolvedValue(null as never)
    const res = await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    expect(res.status).toBe(403)
  })

  it('returns 403 when user has viewer role', async () => {
    authed()
    withMember('viewer')
    const res = await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    expect(res.status).toBe(403)
  })

  it('returns 400 when labels is missing from body', async () => {
    authed()
    withMember()
    const res = await PATCH(makeRequest(CHUNK_ID, {}), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when labels is not an array', async () => {
    authed()
    withMember()
    const res = await PATCH(makeRequest(CHUNK_ID, { labels: 'rule' }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when visibility value is invalid', async () => {
    authed()
    withMember()
    const res = await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'], visibility: 'public' }), {
      params: Promise.resolve({ chunkId: CHUNK_ID }),
    })
    expect(res.status).toBe(400)
  })

  it('updates chunk with new labels appended', async () => {
    authed()
    withMember()
    await PATCH(makeRequest(CHUNK_ID, { labels: ['rule', 'decision'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    expect(mockChunkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CHUNK_ID },
        data: expect.objectContaining({
          labels: expect.arrayContaining(['rule', 'decision']),
        }),
      }),
    )
  })

  it('appends to labeledBy with attribution', async () => {
    authed()
    withMember()
    await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    const call = mockChunkUpdate.mock.calls[0][0]
    const labeledBy = call.data.labeledBy as object[]
    expect(labeledBy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: CLERK_ID, displayName: DISPLAY_NAME, label: 'rule' }),
      ]),
    )
  })

  it('updates visibility when provided', async () => {
    authed()
    withMember()
    await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'], visibility: 'personal' }), {
      params: Promise.resolve({ chunkId: CHUNK_ID }),
    })
    expect(mockChunkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: 'personal', visibilitySetBy: CLERK_ID }),
      }),
    )
  })

  it('does not update visibility when not provided', async () => {
    authed()
    withMember()
    await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    const call = mockChunkUpdate.mock.calls[0][0]
    expect(call.data).not.toHaveProperty('visibility')
  })

  it('returns updated chunk on success', async () => {
    authed()
    withMember()
    const updated = { ...SAMPLE_CHUNK, labels: ['rule'] }
    mockChunkUpdate.mockResolvedValue(updated as never)
    const res = await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.id).toBe(CHUNK_ID)
  })

  it('creates an ActivityEvent with label attribution', async () => {
    authed()
    withMember()
    await PATCH(makeRequest(CHUNK_ID, { labels: ['decision'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    expect(mockTrackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CLERK_ID,
      DISPLAY_NAME,
      'label',
      expect.stringContaining('decision'),
      expect.any(Object),
    )
  })

  it('permits owner, admin, and member roles', async () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      jest.clearAllMocks()
      authed()
      mockChunkFind.mockResolvedValue(SAMPLE_CHUNK as never)
      mockChunkUpdate.mockResolvedValue(SAMPLE_CHUNK as never)
      mockPageFind.mockResolvedValue(SAMPLE_PAGE as never)
      mockTrackEvent.mockResolvedValue(undefined)
      withMember(role)
      const res = await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
      expect(res.status).toBe(200)
    }
  })

  it('returns 500 on database error', async () => {
    authed()
    withMember()
    mockChunkUpdate.mockRejectedValue(new Error('DB error'))
    const res = await PATCH(makeRequest(CHUNK_ID, { labels: ['rule'] }), { params: Promise.resolve({ chunkId: CHUNK_ID }) })
    expect(res.status).toBe(500)
  })
})
