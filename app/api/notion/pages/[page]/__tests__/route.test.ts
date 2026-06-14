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
    workspaceMember: { findUnique: jest.fn() },
    integration: { findUnique: jest.fn() },
    notionPage: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/integrations/connection-server', () => ({
  getConnectedIntegrationToken: jest.fn(() => 'workspace-notion-token'),
}))

const mockAuth = jest.mocked(auth)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockPageFind = jest.mocked(prisma.notionPage.findUnique)
const mockTrackEvent = jest.mocked(trackEvent)

const CLERK_ID = 'clerk-1'
const WORKSPACE_ID = 'ws-1'
const PAGE_ID = 'page-db-1'
const DISPLAY_NAME = 'Ali Z'

const TEAM_CHUNK = {
  id: 'chunk-1',
  content: 'Team visible content',
  blockType: 'paragraph',
  position: 0,
  visibility: 'team',
  labels: ['rule'],
  labeledBy: [{ userId: CLERK_ID, label: 'rule', displayName: DISPLAY_NAME, at: '2025-01-01T00:00:00Z' }],
  pineconeId: 'pin-1',
  metadata: {},
  visibilitySetBy: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
}

const PERSONAL_CHUNK = {
  id: 'chunk-2',
  content: 'Personal content',
  blockType: 'paragraph',
  position: 1,
  visibility: 'personal',
  labels: [],
  labeledBy: [],
  pineconeId: 'pin-2',
  metadata: {},
  visibilitySetBy: CLERK_ID,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
}

const OTHER_USER_PERSONAL_CHUNK = {
  ...PERSONAL_CHUNK,
  id: 'chunk-3',
  position: 2,
  visibilitySetBy: 'clerk-other',
}

const SAMPLE_PAGE = {
  id: PAGE_ID,
  notionPageId: 'notion-abc',
  workspaceId: WORKSPACE_ID,
  title: 'Deployment Guide',
  parentPageId: null,
  content: 'full content',
  blockStructure: [],
  iconUrl: null,
  lastEditedAt: new Date('2025-01-01'),
  syncedBy: CLERK_ID,
  syncedAt: new Date('2025-01-02'),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-02'),
  chunks: [TEAM_CHUNK, PERSONAL_CHUNK, OTHER_USER_PERSONAL_CHUNK],
}

function authed(userId = CLERK_ID) {
  mockAuth.mockResolvedValue({ userId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
}

function withMember(role = 'member') {
  mockMemberFind.mockResolvedValue({ role, status: 'active', displayName: DISPLAY_NAME } as never)
}

function makeRequest(pageId: string) {
  return new Request(`http://localhost/api/notion/pages/${pageId}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPageFind.mockResolvedValue(SAMPLE_PAGE as never)
  mockTrackEvent.mockResolvedValue(undefined)
  ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue({
    type: 'notion',
    accessToken: 'encrypted-token',
    metadata: { status: 'connected', connectedBy: CLERK_ID },
    workspace: { type: 'solo', owner: { clerkId: CLERK_ID } },
  })
})

describe('GET /api/notion/pages/[page]', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when page does not exist', async () => {
    authed()
    withMember()
    mockPageFind.mockResolvedValue(null as never)
    const res = await GET(makeRequest('nonexistent'), { params: Promise.resolve({ page: 'nonexistent' }) })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not a member of the page workspace', async () => {
    authed()
    mockMemberFind.mockResolvedValue(null as never)
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    expect(res.status).toBe(403)
  })

  it('returns 403 when user has viewer role', async () => {
    authed()
    withMember('viewer')
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    expect(res.status).toBe(403)
  })

  it('returns 200 with page and chunks on happy path', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.page.id).toBe(PAGE_ID)
    expect(Array.isArray(body.data.chunks)).toBe(true)
  })

  it('does not expose a stale page when Notion is disconnected', async () => {
    const { getConnectedIntegrationToken } = jest.requireMock('@/lib/integrations/connection-server')
    getConnectedIntegrationToken.mockReturnValueOnce(null)
    authed()
    withMember()

    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })

    expect(res.status).toBe(400)
  })

  it('includes team chunks for all members', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    const body = await res.json()
    const chunkIds = body.data.chunks.map((c: { id: string }) => c.id)
    expect(chunkIds).toContain('chunk-1')
  })

  it('includes own personal chunks', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    const body = await res.json()
    const chunkIds = body.data.chunks.map((c: { id: string }) => c.id)
    expect(chunkIds).toContain('chunk-2')
  })

  it('excludes other users personal chunks', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    const body = await res.json()
    const chunkIds = body.data.chunks.map((c: { id: string }) => c.id)
    expect(chunkIds).not.toContain('chunk-3')
  })

  it('orders chunks by position', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    const body = await res.json()
    const positions = body.data.chunks.map((c: { position: number }) => c.position)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('includes label distribution', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    const body = await res.json()
    expect(body.data.labelDistribution).toBeDefined()
    expect(typeof body.data.labelDistribution).toBe('object')
  })

  it('counts labels correctly in distribution', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    const body = await res.json()
    expect(body.data.labelDistribution.rule).toBe(1)
  })

  it('includes attribution info (syncedBy, labeledBy) in page', async () => {
    authed()
    withMember()
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    const body = await res.json()
    expect(body.data.page.syncedBy).toBeDefined()
    expect(body.data.chunks[0].labeledBy).toBeDefined()
  })

  it('fires a page_viewed activity event', async () => {
    authed()
    withMember('member')
    await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    expect(mockTrackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CLERK_ID,
      DISPLAY_NAME,
      'page_viewed',
      expect.stringContaining('Deployment Guide'),
      expect.any(Object),
    )
  })

  it('returns 500 on database error', async () => {
    authed()
    withMember()
    mockPageFind.mockRejectedValue(new Error('DB error'))
    const res = await GET(makeRequest(PAGE_ID), { params: Promise.resolve({ page: PAGE_ID }) })
    expect(res.status).toBe(500)
  })
})
