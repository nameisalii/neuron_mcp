/** @jest-environment node */
import { prisma } from '@/lib/db'
import { syncJira } from '../sync'
import {
  decodeJiraToken,
  refreshJiraToken,
  searchJiraIssues,
  getJiraIssueComments,
} from '../api'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'

jest.mock('@/lib/db', () => ({
  prisma: {
    integration: { update: jest.fn() },
    knowledgeItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))
jest.mock('../api', () => ({
  JiraApiError: class JiraApiError extends Error {
    constructor(message: string, public status: number, public code?: string) {
      super(message)
    }
  },
  decodeJiraToken: jest.fn(),
  encodeJiraToken: jest.fn(() => 'encrypted-next'),
  refreshJiraToken: jest.fn(),
  searchJiraIssues: jest.fn(),
  getJiraIssueComments: jest.fn(),
}))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn() }))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledgeDetailed: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const token = { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000 }
const baseParams = {
  workspaceId: 'ws-1',
  integrationId: 'int-1',
  encryptedToken: 'encrypted-token',
  metadata: {
    cloudId: 'cloud-1',
    siteUrl: 'https://example.atlassian.net',
    siteName: 'Example Jira',
    resources: [{ id: 'cloud-1', url: 'https://example.atlassian.net', name: 'Example Jira' }],
  },
  lastSyncAt: null,
  syncedBy: 'user-1',
  syncedByName: 'Ali',
}

function adf(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

function issue(summary = 'Fix billing') {
  return {
    id: '10001',
    key: 'PROJ-123',
    fields: {
      summary,
      description: adf('Stripe invoices fail for annual customers'),
      status: { name: 'In Progress' },
      priority: { name: 'High' },
      assignee: { displayName: 'Ali' },
      reporter: { displayName: 'Sam' },
      labels: ['billing'],
      updated: '2026-06-29T12:00:00.000Z',
      created: '2026-06-28T12:00:00.000Z',
      issuetype: { name: 'Bug' },
      project: { key: 'PROJ', name: 'Private Project' },
      comment: { comments: [], total: 0 },
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(decodeJiraToken as jest.Mock).mockReturnValue(token)
  ;(refreshJiraToken as jest.Mock).mockResolvedValue(token)
  ;(searchJiraIssues as jest.Mock)
    .mockResolvedValueOnce({ issues: [issue()], total: 1 })
    .mockResolvedValue({ issues: [], total: 1 })
  ;(getJiraIssueComments as jest.Mock).mockResolvedValue({
    comments: [{ id: 'c-1', body: adf('Launch Friday'), author: { displayName: 'Ali' } }],
    total: 1,
  })
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue(null)
  ;(prisma.knowledgeItem.create as jest.Mock).mockResolvedValue({ id: 'ki-1' })
  ;(prisma.knowledgeItem.update as jest.Mock).mockResolvedValue({ id: 'ki-1' })
  ;(prisma.integration.update as jest.Mock).mockResolvedValue({ id: 'int-1' })
  ;(generateEmbedding as jest.Mock).mockResolvedValue([0.1])
  ;(upsertEmbedding as jest.Mock).mockResolvedValue(undefined)
  ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({
    items: [],
    diagnostics: {
      extractorCalled: 1,
      extractorReturnedEmpty: 0,
      extractorParseFailed: 0,
      validationFailed: 0,
      fallbackItemsCreated: 0,
      knowledgeItemCreateFailed: 0,
      embeddingUpsertFailed: 0,
      itemProcessingFailed: 0,
    },
  })
  jest.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('returns reconnect-needed if token refresh fails', async () => {
  ;(refreshJiraToken as jest.Mock).mockRejectedValue(new Error('expired'))

  const result = await syncJira(baseParams)

  expect(result).toMatchObject({ success: false, reconnectNeeded: true })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})

it('creates a KnowledgeItem from a mocked Jira issue', async () => {
  const result = await syncJira(baseParams)

  expect(result.knowledgeCreated).toBe(1)
  expect(prisma.knowledgeItem.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      workspaceId: 'ws-1',
      source: 'jira',
      sourceExternalId: 'PROJ-123',
      sourceUrl: 'https://example.atlassian.net/browse/PROJ-123',
      owner: 'Ali',
      sourceMetadata: expect.objectContaining({
        cloudId: 'cloud-1',
        issueId: '10001',
        issueKey: 'PROJ-123',
        projectKey: 'PROJ',
        status: 'In Progress',
        priority: 'High',
      }),
    }),
    select: { id: true },
  })
  expect((prisma.knowledgeItem.create as jest.Mock).mock.calls[0][0].data.content)
    .toContain('[PROJ-123] Fix billing')
  expect((prisma.knowledgeItem.create as jest.Mock).mock.invocationCallOrder[0])
    .toBeLessThan((extractKnowledgeDetailed as jest.Mock).mock.invocationCallOrder[0])
})

it.each([
  ['ok', 'small_talk'],
  ['👍', 'emoji_only'],
  ['https://example.com/private', 'url_only'],
])('skips low-quality Jira comments: %s', async (comment, reason) => {
  ;(getJiraIssueComments as jest.Mock).mockResolvedValue({
    comments: [{ id: 'c-1', body: adf(comment) }],
    total: 1,
  })

  const result = await syncJira(baseParams)

  expect(result.skippedReasons).toEqual({ [reason]: 1 })
  expect(prisma.knowledgeItem.create).toHaveBeenCalled()
})

it.each(['Launch Friday', 'Fix billing'])('does not skip useful short Jira comments: %s', async (comment) => {
  ;(getJiraIssueComments as jest.Mock).mockResolvedValue({
    comments: [{ id: 'c-1', body: adf(comment) }],
    total: 1,
  })

  await syncJira(baseParams)

  expect((prisma.knowledgeItem.create as jest.Mock).mock.calls[0][0].data.content).toContain(comment)
})

it('does not duplicate a repeated Jira issue', async () => {
  ;(prisma.knowledgeItem.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' })

  const result = await syncJira(baseParams)

  expect(result.skippedReasons).toEqual({ duplicate: 1 })
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})
