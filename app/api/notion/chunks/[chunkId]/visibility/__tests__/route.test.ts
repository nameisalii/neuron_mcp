/**
 * @jest-environment node
 */
import { PATCH } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { moveVector } from '@/lib/pinecone'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    workspaceMember: { findUnique: jest.fn() },
    notionChunk: { findUnique: jest.fn(), update: jest.fn() },
    notionPage: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ moveVector: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockChunkFind = jest.mocked(prisma.notionChunk.findUnique)
const mockChunkUpdate = jest.mocked(prisma.notionChunk.update)
const mockPageFind = jest.mocked(prisma.notionPage.findUnique)
const mockTrackEvent = jest.mocked(trackEvent)
const mockMoveVector = jest.mocked(moveVector)

const CLERK_ID = 'clerk-1'
const WORKSPACE_ID = 'ws-1'
const CHUNK_ID = 'chunk-1'
const PAGE_ID = 'page-1'
const DISPLAY_NAME = 'Ali Z'

const TEAM_CHUNK = {
  id: CHUNK_ID,
  workspaceId: WORKSPACE_ID,
  notionPageId: PAGE_ID,
  content: 'Some content',
  blockType: 'paragraph',
  position: 0,
  labels: [],
  labeledBy: [],
  visibility: 'team',
  visibilitySetBy: CLERK_ID,
  pineconeId: `${WORKSPACE_ID}-${PAGE_ID}-0`,
  metadata: {},
}

const SAMPLE_PAGE = { id: PAGE_ID, title: 'Deployment Guide', workspaceId: WORKSPACE_ID }

function authed(userId = CLERK_ID) {
  mockAuth.mockResolvedValue({ userId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
}

function withMember(role = 'member') {
  mockMemberFind.mockResolvedValue({ role, status: 'active', displayName: DISPLAY_NAME } as never)
}

function makeRequest(chunkId: string, body: object) {
  return new Request(`http://localhost/api/notion/chunks/${chunkId}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockChunkFind.mockResolvedValue(TEAM_CHUNK as never)
  mockChunkUpdate.mockResolvedValue({ ...TEAM_CHUNK, visibility: 'personal', visibilitySetBy: CLERK_ID } as never)
  mockPageFind.mockResolvedValue(SAMPLE_PAGE as never)
  mockMoveVector.mockResolvedValue(undefined)
  mockTrackEvent.mockResolvedValue(undefined)
})

describe('PATCH /api/notion/chunks/[chunkId]/visibility', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when chunk does not exist', async () => {
    authed()
    withMember()
    mockChunkFind.mockResolvedValue(null as never)
    const res = await PATCH(makeRequest('bad', { visibility: 'personal' }), { params: { chunkId: 'bad' } })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not a member of the chunk workspace', async () => {
    authed()
    mockMemberFind.mockResolvedValue(null as never)
    const res = await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(res.status).toBe(403)
  })

  it('returns 400 when visibility value is invalid', async () => {
    authed()
    withMember()
    const res = await PATCH(makeRequest(CHUNK_ID, { visibility: 'public' }), { params: { chunkId: CHUNK_ID } })
    expect(res.status).toBe(400)
  })

  it('allows chunk syncedBy user to change visibility', async () => {
    authed(CLERK_ID)
    withMember('member')
    const res = await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(res.status).toBe(200)
  })

  it('allows admin to change visibility on any chunk', async () => {
    authed('clerk-admin')
    mockMemberFind.mockResolvedValue({ role: 'admin', status: 'active', displayName: 'Admin' } as never)
    const res = await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(res.status).toBe(200)
  })

  it('returns 403 when a non-owner member tries to change a chunk they did not label', async () => {
    authed('clerk-other')
    mockMemberFind.mockResolvedValue({ role: 'member', status: 'active', displayName: 'Other' } as never)
    const res = await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(res.status).toBe(403)
  })

  it('updates chunk visibility and visibilitySetBy', async () => {
    authed()
    withMember()
    await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(mockChunkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CHUNK_ID },
        data: expect.objectContaining({ visibility: 'personal', visibilitySetBy: CLERK_ID }),
      }),
    )
  })

  it('calls moveVector when visibility changes from team to personal', async () => {
    authed()
    withMember()
    await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(mockMoveVector).toHaveBeenCalledWith(
      expect.any(String),
      WORKSPACE_ID,
      `${WORKSPACE_ID}:${CLERK_ID}`,
    )
  })

  it('calls moveVector when visibility changes from personal to team', async () => {
    authed()
    withMember()
    mockChunkFind.mockResolvedValue({ ...TEAM_CHUNK, visibility: 'personal' } as never)
    await PATCH(makeRequest(CHUNK_ID, { visibility: 'team' }), { params: { chunkId: CHUNK_ID } })
    expect(mockMoveVector).toHaveBeenCalledWith(
      expect.any(String),
      `${WORKSPACE_ID}:${CLERK_ID}`,
      WORKSPACE_ID,
    )
  })

  it('does not call moveVector when visibility is unchanged', async () => {
    authed()
    withMember()
    await PATCH(makeRequest(CHUNK_ID, { visibility: 'team' }), { params: { chunkId: CHUNK_ID } })
    expect(mockMoveVector).not.toHaveBeenCalled()
  })

  it('creates ActivityEvent with change description', async () => {
    authed()
    withMember()
    await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(mockTrackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CLERK_ID,
      DISPLAY_NAME,
      'label',
      expect.stringContaining('personal'),
      expect.any(Object),
    )
  })

  it('returns updated chunk on success', async () => {
    authed()
    withMember()
    const res = await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
  })

  it('returns 500 on database error', async () => {
    authed()
    withMember()
    mockChunkUpdate.mockRejectedValue(new Error('DB error'))
    const res = await PATCH(makeRequest(CHUNK_ID, { visibility: 'personal' }), { params: { chunkId: CHUNK_ID } })
    expect(res.status).toBe(500)
  })
})
