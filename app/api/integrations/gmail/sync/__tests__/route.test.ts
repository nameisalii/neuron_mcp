/** @jest-environment node */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { syncGmail } from '@/lib/gmail/sync'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    integration: { findUnique: jest.fn() },
    syncStatus: { upsert: jest.fn() },
  },
}))
jest.mock('@/lib/gmail/sync', () => ({ syncGmail: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockIntegrationFind = jest.mocked(prisma.integration.findUnique)
const mockSyncStatusUpsert = jest.mocked(prisma.syncStatus.upsert)
const mockSyncGmail = jest.mocked(syncGmail)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  mockMemberFind.mockResolvedValue({ role: 'member', displayName: 'Ali' } as never)
  mockIntegrationFind.mockResolvedValue({
    id: 'int-1',
    accessToken: 'encrypted',
    lastSyncAt: null,
    metadata: {
      selectedLabels: ['INBOX'],
      selectedLabelNames: ['Inbox'],
      timeWindow: 30,
      senderFilter: [],
    },
  } as never)
  mockSyncStatusUpsert.mockResolvedValue({} as never)
  mockSyncGmail.mockResolvedValue({
    success: true,
    threadsProcessed: 2,
    messagesProcessed: 6,
    extractedKnowledgeItems: 4,
    aiExtractedKnowledgeItems: 3,
    fallbackKnowledgeItems: 1,
    chunksEmbedded: 6,
    extractionDiagnostics: {
      extractorCalled: 2,
      extractorNotCalled: 0,
      extractorReturnedEmpty: 1,
      extractorParseFailed: 0,
      validationFailed: 0,
      fallbackItemsCreated: 0,
      knowledgeItemCreateFailed: 0,
      embeddingUpsertFailed: 0,
      itemProcessingFailed: 0,
      contentTooShort: 0,
      skippedPromotional: 0,
      skippedNoUsefulSignal: 0,
      fallbackCreateFailed: 0,
    },
    deleted: 1,
    skipped: 0,
    skippedReasons: {},
    capped: false,
    labelsScanned: 1,
    selectedLabels: ['INBOX'],
    labelIdsUsed: ['INBOX'],
    gmailQueryUsed: 'after:2026/06/01',
    messagesFoundBeforeFiltering: 6,
    messagesFetched: 6,
    threadsCreated: 2,
    chunksCreated: 6,
    syncFrom: null,
    configuredSyncFrom: null,
    effectiveQueryStart: '2026-06-01T00:00:00.000Z',
    lastSyncAtBeforeRun: null,
    lastSyncAtAfterRun: '2026-06-12T00:00:00.000Z',
    lastSyncAttemptAt: '2026-06-12T00:00:00.000Z',
    lastSuccessfulImportAt: '2026-06-12T00:00:00.000Z',
    namespaceUsed: 'ws-1:user-1',
    lastSyncedAt: '2026-06-12T00:00:00.000Z',
    importedThreads: 2,
    importedChunks: 6,
    canReadMailbox: true,
    recentMessagesAvailable: 5,
    inboxMessagesAvailable: 4,
    sentMessagesAvailable: 2,
    diagnosticRecentCount: 5,
    diagnosticInboxCount: 4,
    diagnosticSentCount: 2,
  })
})

it('returns structured Gmail sync counts', async () => {
  const res = await POST()
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toMatchObject({
    success: true,
    selectedLabels: ['INBOX'],
    labelIdsUsed: ['INBOX'],
    gmailQueryUsed: 'after:2026/06/01',
    messagesFoundBeforeFiltering: 6,
    messagesFetched: 6,
    threadsCreated: 2,
    chunksCreated: 6,
    importedThreads: 2,
    importedChunks: 6,
    extractedKnowledgeItems: 4,
    aiExtractedKnowledgeItems: 3,
    fallbackKnowledgeItems: 1,
    chunksEmbedded: 6,
    labelsScanned: 1,
    namespaceUsed: 'ws-1:user-1',
    canReadMailbox: true,
    diagnosticInboxCount: 4,
    diagnosticSentCount: 2,
  })
  expect(mockSyncStatusUpsert).toHaveBeenCalled()
})

it('rejects sync when Gmail is not configured', async () => {
  mockIntegrationFind.mockResolvedValue({
    id: 'int-1',
    accessToken: 'encrypted',
    lastSyncAt: null,
    metadata: { selectedLabels: [] },
  } as never)
  const res = await POST()
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toMatch(/not configured/i)
})

it('enforces cooldown', async () => {
  mockIntegrationFind.mockResolvedValue({
    id: 'int-1',
    accessToken: 'encrypted',
    lastSyncAt: new Date(Date.now() - 10_000),
    metadata: {
      selectedLabels: ['INBOX'],
      selectedLabelNames: ['Inbox'],
      timeWindow: 30,
      senderFilter: [],
    },
  } as never)
  const res = await POST()
  expect(res.status).toBe(429)
})
