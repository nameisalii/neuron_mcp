/**
 * @jest-environment node
 */
import { syncLinearIssues } from '../sync'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { prisma } from '@/lib/db'

jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn(), searchSimilar: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    integration: { update: jest.fn() },
  },
}))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn().mockReturnValue('raw_token') }))

const mockFetch = jest.fn()
global.fetch = mockFetch

const BASE_INTEGRATION = {
  id: 'int_1',
  workspaceId: 'ws_1',
  accessToken: 'enc_tok',
  lastSyncAt: null as Date | null,
  metadata: null as Record<string, unknown> | null,
}

const ISSUE = {
  id: 'lin_1',
  title: 'Fix login bug',
  description: 'Users cannot log in when MFA is enabled',
  url: 'https://linear.app/team/issue/ENG-1',
  state: { name: 'In Progress' },
  assignee: { name: 'Alice' },
  team: { name: 'Engineering' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

describe('syncLinearIssues', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(generateEmbedding as jest.Mock).mockResolvedValue(new Array(1536).fill(0))
    ;(upsertEmbedding as jest.Mock).mockResolvedValue(undefined)
    ;(prisma.knowledgeItem.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.knowledgeItem.create as jest.Mock).mockResolvedValue({ id: 'ki_1' })
    ;(prisma.knowledgeItem.update as jest.Mock).mockResolvedValue({})
    ;(prisma.knowledgeItem.delete as jest.Mock).mockResolvedValue({})
    ;(prisma.integration.update as jest.Mock).mockResolvedValue({})
  })

  it('fetches issues and creates KnowledgeItems', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [ISSUE],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    })

    const result = await syncLinearIssues(BASE_INTEGRATION)

    expect(result.synced).toBe(1)
    expect(prisma.knowledgeItem.create).toHaveBeenCalledTimes(1)
    const createArg = (prisma.knowledgeItem.create as jest.Mock).mock.calls[0][0].data
    expect(createArg.source).toBe('linear')
    expect(createArg.sourceCreatedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('skips issues with no description', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [{ ...ISSUE, description: null }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    })

    const result = await syncLinearIssues(BASE_INTEGRATION)
    expect(result.synced).toBe(0)
    expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
  })

  it('stores backfill cursor when more pages exist', async () => {
    const pageWithMore = {
      ok: true,
      json: async () => ({
        data: { issues: { nodes: [ISSUE], pageInfo: { hasNextPage: true, endCursor: 'cursor_abc' } } },
      }),
    }
    // MAX_PAGES = 4: mock all 4 pages returning hasNextPage true; loop exits after MAX_PAGES
    mockFetch
      .mockResolvedValueOnce(pageWithMore)
      .mockResolvedValueOnce(pageWithMore)
      .mockResolvedValueOnce(pageWithMore)
      .mockResolvedValueOnce(pageWithMore)

    await syncLinearIssues(BASE_INTEGRATION)

    expect(prisma.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ backfillCursor: 'cursor_abc' }),
        }),
      }),
    )
  })

  it('resumes from backfill cursor on next sync', async () => {
    const integrationWithCursor = {
      ...BASE_INTEGRATION,
      metadata: { backfillCursor: 'cursor_abc' },
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [ISSUE],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    })

    await syncLinearIssues(integrationWithCursor)

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.variables.after).toBe('cursor_abc')
  })

  it('returns zero synced when Linear returns empty list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
      }),
    })

    const result = await syncLinearIssues(BASE_INTEGRATION)
    expect(result.synced).toBe(0)
    expect(result.extracted).toBe(0)
  })

  it('throws when Linear API returns non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(syncLinearIssues(BASE_INTEGRATION)).rejects.toThrow()
  })
})
