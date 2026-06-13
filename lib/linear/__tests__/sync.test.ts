/** @jest-environment node */
import { syncLinearIssues } from '../sync'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding, deleteEmbeddings } from '@/lib/pinecone'
import { prisma } from '@/lib/db'
import { extractKnowledge } from '@/lib/extraction/extractor'

jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn(), deleteEmbeddings: jest.fn() }))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledge: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: {
      create: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn(), delete: jest.fn(),
    },
    integration: { update: jest.fn() },
  },
}))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn().mockReturnValue('raw_token') }))

const mockFetch = jest.fn()
global.fetch = mockFetch

const BASE_INTEGRATION = {
  id: 'int_1', workspaceId: 'ws_1', accessToken: 'enc_tok',
  lastSyncAt: null as Date | null, metadata: null as Record<string, unknown> | null,
}

const ISSUE = {
  id: 'lin_1', identifier: 'DT-96', title: 'torch.compile', description: null,
  url: 'https://linear.app/deeptracer/issue/DT-96', priority: 2, priorityLabel: 'High',
  state: { name: 'In Review', type: 'started' }, assignee: null, creator: { name: 'Ali' },
  team: { id: 'team-dt', name: 'DeepTracer', key: 'DT' }, project: null,
  labels: { nodes: [] }, comments: { nodes: [] }, history: { nodes: [] },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  completedAt: null, canceledAt: null, archivedAt: null,
}

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) }
}

function mockAccessAndTeamIssues(issues: typeof ISSUE[], teamName = 'DeepTracer') {
  mockFetch
    .mockResolvedValueOnce(response({
      viewer: { id: 'viewer-1', name: 'Ali' },
      organization: { id: 'org-1', name: 'DeepTracer' },
      teams: { nodes: [{ id: 'team-dt', name: teamName, key: 'DT' }] },
    }))
    .mockResolvedValueOnce(response({
      team: { issues: { nodes: issues.map(({ id }) => ({ id })), pageInfo: { hasNextPage: false, endCursor: null } } },
    }))
  for (const issue of issues) mockFetch.mockResolvedValueOnce(response({ issue }))
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(generateEmbedding as jest.Mock).mockResolvedValue(new Array(1536).fill(0))
  ;(upsertEmbedding as jest.Mock).mockResolvedValue(undefined)
  ;(extractKnowledge as jest.Mock).mockResolvedValue([])
  ;(prisma.knowledgeItem.count as jest.Mock).mockResolvedValue(0)
  ;(prisma.knowledgeItem.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.knowledgeItem.deleteMany as jest.Mock).mockResolvedValue({ count: 0 })
  ;(prisma.knowledgeItem.create as jest.Mock).mockResolvedValue({ id: 'ki_1' })
  ;(prisma.knowledgeItem.update as jest.Mock).mockResolvedValue({})
  ;(prisma.knowledgeItem.delete as jest.Mock).mockResolvedValue({})
  ;(prisma.integration.update as jest.Mock).mockResolvedValue({})
})

describe('syncLinearIssues', () => {
  it('imports a title-only issue as a fallback KnowledgeItem', async () => {
    mockAccessAndTeamIssues([ISSUE])
    const result = await syncLinearIssues(BASE_INTEGRATION)

    expect(result).toMatchObject({ success: true, issuesFound: 1, teamsScanned: 1, imported: 1 })
    expect(prisma.knowledgeItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: 'linear',
        sourceExternalId: 'lin_1',
        content: expect.stringContaining('Linear issue DT-96: torch.compile'),
      }),
    }))
  })

  it('scans every accessible team and reports issue counts per team', async () => {
    mockFetch
      .mockResolvedValueOnce(response({
        viewer: { id: 'viewer-1', name: 'Ali' },
        organization: { id: 'org-1', name: 'DeepTracer' },
        teams: { nodes: [{ id: 'team-empty', name: 'COl', key: 'COL' }, { id: 'team-dt', name: 'DeepTracer', key: 'DT' }] },
      }))
      .mockResolvedValueOnce(response({ team: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } }))
      .mockResolvedValueOnce(response({ team: { issues: { nodes: [{ id: ISSUE.id }], pageInfo: { hasNextPage: false, endCursor: null } } } }))
      .mockResolvedValueOnce(response({ issue: ISSUE }))

    const result = await syncLinearIssues(BASE_INTEGRATION)
    expect(result.teamsScanned).toBe(2)
    expect(result.issuesFound).toBe(1)
    expect(result.teams).toEqual([
      { id: 'team-empty', name: 'COl', key: 'COL', issuesFound: 0 },
      { id: 'team-dt', name: 'DeepTracer', key: 'DT', issuesFound: 1 },
    ])
  })

  it('forces a full scan after a previous empty sync advanced lastSyncAt', async () => {
    mockAccessAndTeamIssues([ISSUE])
    await syncLinearIssues({ ...BASE_INTEGRATION, lastSyncAt: new Date('2026-06-12T00:00:00Z') })
    const teamRequest = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(teamRequest.query).not.toContain('updatedAt: { gt: $updatedAfter }')
    expect(teamRequest.variables.updatedAfter).toBeUndefined()
  })

  it('uses incremental filtering once Linear items exist', async () => {
    ;(prisma.knowledgeItem.count as jest.Mock).mockResolvedValueOnce(3).mockResolvedValue(0)
    mockAccessAndTeamIssues([ISSUE])
    await syncLinearIssues({ ...BASE_INTEGRATION, lastSyncAt: new Date('2026-06-12T00:00:00Z') })
    const teamRequest = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(teamRequest.variables.updatedAfter).toBe('2026-06-12T00:00:00.000Z')
  })

  it('updates lastSyncAt even when no issues are returned and returns a visible warning', async () => {
    mockAccessAndTeamIssues([])
    const result = await syncLinearIssues(BASE_INTEGRATION)
    expect(result.message).toMatch(/no issues were returned/i)
    expect(prisma.integration.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastSyncAt: expect.any(Date) }),
    }))
  })

  it('continues after an issue failure and returns the skip reason', async () => {
    ;(generateEmbedding as jest.Mock).mockRejectedValue(new Error('Embedding failed'))
    mockAccessAndTeamIssues([ISSUE])
    const result = await syncLinearIssues(BASE_INTEGRATION)
    expect(result.skipped).toBe(1)
    expect(result.skippedReasons).toEqual({ 'Embedding failed': 1 })
  })

  it('deletes archived issues and vectors', async () => {
    ;(prisma.knowledgeItem.findMany as jest.Mock).mockResolvedValue([{ id: 'ki_1', embeddingId: 'ki_1' }])
    ;(prisma.knowledgeItem.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })
    mockAccessAndTeamIssues([{ ...ISSUE, archivedAt: '2026-01-03T00:00:00.000Z' } as unknown as typeof ISSUE])
    const result = await syncLinearIssues(BASE_INTEGRATION)
    expect(deleteEmbeddings).toHaveBeenCalledWith(['ki_1'])
    expect(result.deleted).toBe(1)
  })

  it('throws useful Linear GraphQL errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ errors: [{ message: 'Insufficient scope' }] }) })
    await expect(syncLinearIssues(BASE_INTEGRATION)).rejects.toThrow('Insufficient scope')
  })
})
