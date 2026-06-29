/** @jest-environment node */
import { syncGranola } from '../sync'
import { prisma } from '@/lib/db'
import { listNotes, getNote } from '@/lib/granola/api'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'

jest.mock('@/lib/db', () => ({
  prisma: { knowledgeItem: { count: jest.fn() } },
}))
jest.mock('@/lib/granola/api', () => ({
  listNotes: jest.fn(),
  getNote: jest.fn(),
  GranolaApiError: class extends Error {},
}))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledgeDetailed: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn().mockResolvedValue(undefined) }))

const diagnostics = {
  extractorCalled: 1,
  extractorReturnedEmpty: 0,
  extractorParseFailed: 0,
  validationFailed: 0,
  fallbackItemsCreated: 0,
  knowledgeItemCreateFailed: 0,
  embeddingUpsertFailed: 0,
  itemProcessingFailed: 0,
}

const SECRET_TOKEN = 'grn_supersecrettoken123'
const PRIVATE_CONTENT = 'Confidential: we will acquire AcmeCorp next quarter'

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.knowledgeItem.count as jest.Mock).mockResolvedValue(0)
  ;(getNote as jest.Mock).mockImplementation(async (_token: string, id: string) => ({
    id,
    title: 'Q3 Planning',
    summary: PRIVATE_CONTENT,
    created_at: '2026-06-10T10:00:00.000Z',
    url: `https://granola.ai/notes/${id}`,
    owner: { name: 'Alex', email: 'alex@example.com' },
    attendees: [{ name: 'Alex' }],
    transcript: [{ speaker: 'Alex', text: 'secret transcript line' }],
  }))
  ;(extractKnowledgeDetailed as jest.Mock).mockResolvedValue({
    items: [{ content: 'We will acquire AcmeCorp', category: 'decision', owner: null, confidence: 0.9 }],
    diagnostics,
  })
})

it('creates KnowledgeItems from fetched notes with granola source attribution', async () => {
  ;(listNotes as jest.Mock).mockResolvedValueOnce({
    notes: [{ id: 'not_1' }, { id: 'not_2' }],
    nextCursor: null,
  })

  const result = await syncGranola({
    workspaceId: 'ws-1',
    token: SECRET_TOKEN,
    syncedBy: 'user-1',
    syncedByName: 'Alex',
    lastSyncAt: null,
  })

  expect(result.fetched).toBe(2)
  expect(result.processed).toBe(2)
  expect(result.knowledgeCreated).toBe(2)
  // source attribution preserved
  expect(extractKnowledgeDetailed).toHaveBeenCalledWith(
    expect.any(Array),
    'ws-1',
    'granola',
    'https://granola.ai/notes/not_1',
    'not_1',
  )
})

it('is idempotent — already-synced notes are skipped without re-extracting', async () => {
  ;(listNotes as jest.Mock).mockResolvedValueOnce({ notes: [{ id: 'not_1' }], nextCursor: null })
  ;(prisma.knowledgeItem.count as jest.Mock).mockResolvedValue(1) // already exists

  const result = await syncGranola({
    workspaceId: 'ws-1',
    token: SECRET_TOKEN,
    syncedBy: 'user-1',
    syncedByName: 'Alex',
    lastSyncAt: null,
  })

  expect(result.skipped).toBe(1)
  expect(result.skippedReasons.already_synced).toBe(1)
  expect(extractKnowledgeDetailed).not.toHaveBeenCalled()
})

it('never logs the API token or raw note content', async () => {
  const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  ;(listNotes as jest.Mock).mockResolvedValueOnce({ notes: [{ id: 'not_1' }], nextCursor: null })

  await syncGranola({
    workspaceId: 'ws-1',
    token: SECRET_TOKEN,
    syncedBy: 'user-1',
    syncedByName: 'Alex',
    lastSyncAt: null,
  })

  const logged = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls])
  expect(logged).not.toContain(SECRET_TOKEN)
  expect(logged).not.toContain(PRIVATE_CONTENT)
  expect(logged).not.toContain('secret transcript line')

  infoSpy.mockRestore()
  errorSpy.mockRestore()
})
