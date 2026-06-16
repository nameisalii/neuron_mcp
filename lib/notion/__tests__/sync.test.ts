/**
 * @jest-environment node
 */
import { syncNotionPages } from '../sync'
import { escapeXml } from '@/lib/utils'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding, deleteEmbeddings } from '@/lib/pinecone'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockSearch = jest.fn()
const mockBlocksList = jest.fn()

jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    search: mockSearch,
    blocks: { children: { list: mockBlocksList } },
  })),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    notionPage: { upsert: jest.fn(), findUnique: jest.fn() },
    notionChunk: { create: jest.fn(), deleteMany: jest.fn() },
    knowledgeItem: { count: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  },
}))

jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn(), deleteEmbeddings: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/extraction/extractor', () => ({ extractKnowledgeDetailed: jest.fn() }))

// ─── typed refs ───────────────────────────────────────────────────────────────

const mockGenerateEmbedding = jest.mocked(generateEmbedding)
const mockUpsertEmbedding = jest.mocked(upsertEmbedding)
const mockDeleteEmbeddings = jest.mocked(deleteEmbeddings)
const mockPageUpsert = jest.mocked(prisma.notionPage.upsert)
const mockPageFindUnique = jest.mocked(prisma.notionPage.findUnique)
const mockChunkCreate = jest.mocked(prisma.notionChunk.create)
const mockChunkDeleteMany = jest.mocked(prisma.notionChunk.deleteMany)
const mockTrackEvent = jest.mocked(trackEvent)
const mockExtractKnowledgeDetailed = jest.mocked(extractKnowledgeDetailed)
const mockKnowledgeCount = jest.mocked(prisma.knowledgeItem.count)
const mockKnowledgeFindMany = jest.mocked(prisma.knowledgeItem.findMany)
const mockKnowledgeDeleteMany = jest.mocked(prisma.knowledgeItem.deleteMany)

// ─── helpers ──────────────────────────────────────────────────────────────────

function richText(text: string) {
  return [{ plain_text: text, annotations: {}, type: 'text', text: { content: text, link: null } }]
}

function makePage(id: string, title: string, lastEditedAt = '2026-01-01T00:00:00.000Z', parentId?: string) {
  return {
    object: 'page',
    id,
    last_edited_time: lastEditedAt,
    parent: parentId ? { type: 'page_id', page_id: parentId } : { type: 'workspace', workspace: true },
    properties: { title: { type: 'title', title: [{ plain_text: title }] } },
    icon: null,
    cover: null,
    url: `https://notion.so/${id.replace(/-/g, '')}`,
  }
}

function makeBlock(type: string, overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, Record<string, unknown>> = {
    paragraph: { paragraph: { rich_text: richText('paragraph text') } },
    heading_1: { heading_1: { rich_text: richText('heading 1 text') } },
    heading_2: { heading_2: { rich_text: richText('heading 2 text') } },
    heading_3: { heading_3: { rich_text: richText('heading 3 text') } },
    bulleted_list_item: { bulleted_list_item: { rich_text: richText('bullet text') } },
    numbered_list_item: { numbered_list_item: { rich_text: richText('numbered text') } },
    callout: { callout: { rich_text: richText('callout text') } },
    code: { code: { rich_text: richText('const x = 1'), language: 'typescript' } },
    toggle: { toggle: { rich_text: richText('toggle title') } },
    quote: { quote: { rich_text: richText('quote text') } },
    image: { image: { type: 'external', external: { url: 'https://img.test/a.png' }, caption: richText('image caption') } },
    embed: { embed: { url: 'https://embed.test/video' } },
    divider: { divider: {} },
    table_row: { table_row: { cells: [richText('col A'), richText('col B')] } },
    child_page: { child_page: { title: 'Child Page Title' } },
  }
  return { type, id: `block-${type}`, has_children: false, ...defaults[type], ...overrides }
}

function dbPage(notionPageId: string, lastEditedAt: string) {
  return { id: `db-${notionPageId}`, notionPageId, title: 'Page', content: 'Existing page content', lastEditedAt: new Date(lastEditedAt), pineconeId: null }
}

const WORKSPACE_ID = 'ws-1'
const USER_ID = 'user-clerk-1'
const DISPLAY_NAME = 'Ali Z'
const MOCK_EMBEDDING = [0.1, 0.2, 0.3]

beforeAll(() => {
  process.env.NOTION_TOKEN = 'test-token'
})

beforeEach(() => {
  jest.clearAllMocks()
  mockGenerateEmbedding.mockResolvedValue(MOCK_EMBEDDING)
  mockUpsertEmbedding.mockResolvedValue(undefined)
  mockDeleteEmbeddings.mockResolvedValue(undefined)
  mockChunkDeleteMany.mockResolvedValue({ count: 0 })
  let chunkSeq = 0
  ;(mockChunkCreate as jest.Mock).mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: `chunk-${++chunkSeq}`, ...args.data }),
  )
  mockTrackEvent.mockResolvedValue(undefined)
  mockExtractKnowledgeDetailed.mockResolvedValue({
    items: [],
    diagnostics: {
      extractorCalled: 1,
      extractorReturnedEmpty: 1,
      extractorParseFailed: 0,
      validationFailed: 0,
      knowledgeItemCreateFailed: 0,
      embeddingUpsertFailed: 0,
      itemProcessingFailed: 0,
    },
  })
  mockKnowledgeCount.mockResolvedValue(1)
  mockKnowledgeFindMany.mockResolvedValue([])
  mockKnowledgeDeleteMany.mockResolvedValue({ count: 0 })
  // Default: page not in DB yet (no diff skip)
  mockPageFindUnique.mockResolvedValue(null)
  mockPageUpsert.mockImplementation(({ create }) => Promise.resolve({ id: `db-${create.notionPageId}`, ...create }) as never)
})

// ─── escapeXml ────────────────────────────────────────────────────────────────

describe('escapeXml', () => {
  it('escapes & < >', () => {
    expect(escapeXml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
  })
  it('leaves plain text unchanged', () => {
    expect(escapeXml('hello world')).toBe('hello world')
  })
  it('escapes multiple occurrences', () => {
    expect(escapeXml('x < y & z > w')).toBe('x &lt; y &amp; z &gt; w')
  })
})

// ─── block type extraction ─────────────────────────────────────────────────────

describe('block extraction — all supported types', () => {
  function singleBlockTest(blockType: string, expectedContent: string) {
    it(`extracts ${blockType}`, async () => {
      mockSearch.mockResolvedValueOnce({
        results: [makePage('page-1', 'Test Page')],
        next_cursor: null,
        has_more: false,
      })
      mockBlocksList.mockResolvedValueOnce({
        results: [makeBlock(blockType)],
        next_cursor: null,
        has_more: false,
      })

      await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

      const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string; blockType: string })
      expect(chunks.some((c) => c.blockType === blockType && c.content.includes(expectedContent))).toBe(true)
    })
  }

  singleBlockTest('paragraph', 'paragraph text')
  singleBlockTest('heading_1', 'heading 1 text')
  singleBlockTest('heading_2', 'heading 2 text')
  singleBlockTest('heading_3', 'heading 3 text')
  singleBlockTest('bulleted_list_item', 'bullet text')
  singleBlockTest('numbered_list_item', 'numbered text')
  singleBlockTest('callout', 'callout text')
  singleBlockTest('code', 'const x = 1')
  singleBlockTest('toggle', 'toggle title')
  singleBlockTest('quote', 'quote text')

  it('extracts image caption as chunk content', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('image')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string })
    expect(chunks.some((c) => c.content.includes('image caption'))).toBe(true)
  })

  it('stores image blocks without captions as [Image] placeholder with imageUrl metadata', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [{ type: 'image', id: 'b1', has_children: false, image: { type: 'external', external: { url: 'https://img.test/a.png' }, caption: [] } }],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string; metadata: Record<string, unknown> })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('[Image]')
    expect(chunks[0].metadata.imageUrl).toBe('https://img.test/a.png')
  })

  it('extracts embed URL as chunk content', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('embed')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string })
    expect(chunks.some((c) => c.content.includes('https://embed.test/video'))).toBe(true)
  })

  it('skips divider blocks', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('divider')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockChunkCreate).not.toHaveBeenCalled()
  })

  it('extracts table_row cells joined with separator', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('table_row')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string; blockType: string })
    const row = chunks.find((c) => c.blockType === 'table_row')
    expect(row?.content).toContain('col A')
    expect(row?.content).toContain('col B')
  })

  it('stores code language in chunk metadata', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('code')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunk = mockChunkCreate.mock.calls[0]?.[0]?.data as { metadata: unknown }
    expect(JSON.stringify(chunk?.metadata)).toContain('typescript')
  })

  it('stores heading level in chunk metadata', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('heading_2')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunk = mockChunkCreate.mock.calls[0]?.[0]?.data as { metadata: unknown }
    expect(JSON.stringify(chunk?.metadata)).toContain('2')
  })
})

// ─── escapeXml applied to stored content ─────────────────────────────────────

describe('escapeXml applied before storage', () => {
  it('escapes XML chars in paragraph text before writing to DB', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Title')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [{
        type: 'paragraph', id: 'b1', has_children: false,
        paragraph: { rich_text: [{ plain_text: 'Foo & Bar <baz>', annotations: {}, type: 'text', text: { content: '', link: null } }] },
      }],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunk = mockChunkCreate.mock.calls[0]?.[0]?.data as { content: string }
    expect(chunk?.content).toBe('Foo &amp; Bar &lt;baz&gt;')
  })
})

// ─── chunk positions and visibility ──────────────────────────────────────────

describe('chunk positions and visibility', () => {
  it('assigns sequential position starting at 0', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [makeBlock('paragraph'), makeBlock('heading_1'), makeBlock('heading_2')],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { position: number })
    expect(chunks.map((c) => c.position)).toEqual([0, 1, 2])
  })

  it('new chunks default to visibility "team"', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { visibility: string })
    expect(chunks.every((c) => c.visibility === 'team')).toBe(true)
  })
})

// ─── diff sync ────────────────────────────────────────────────────────────────

describe('diff sync — skip unchanged pages', () => {
  it('skips page when lastEditedAt is unchanged', async () => {
    const editedAt = '2026-01-01T00:00:00.000Z'
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page', editedAt)], next_cursor: null, has_more: false })
    // DB has the same timestamp
    mockPageFindUnique.mockResolvedValueOnce(dbPage('page-1', editedAt) as never)

    const result = await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockBlocksList).not.toHaveBeenCalled()
    expect(mockChunkCreate).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
  })

  it('re-syncs page when lastEditedAt changed', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page', '2026-02-01T00:00:00.000Z')], next_cursor: null, has_more: false })
    // DB has older timestamp
    mockPageFindUnique.mockResolvedValueOnce(dbPage('page-1', '2026-01-01T00:00:00.000Z') as never)
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockBlocksList).toHaveBeenCalledTimes(1)
    expect(mockChunkDeleteMany).toHaveBeenCalled()
    expect(mockChunkCreate).toHaveBeenCalled()
  })

  it('backfills extraction when an unchanged page has no Notion knowledge items', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockPageFindUnique.mockResolvedValueOnce(dbPage('page-1', '2026-01-01T00:00:00.000Z') as never)
    mockKnowledgeCount.mockResolvedValueOnce(0)
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    const result = await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(result.pages).toBe(1)
    expect(mockBlocksList).not.toHaveBeenCalled()
    expect(mockGenerateEmbedding).not.toHaveBeenCalled()
    expect(mockExtractKnowledgeDetailed).toHaveBeenCalledWith(
      expect.any(Array),
      WORKSPACE_ID,
      'notion',
      'https://notion.so/page1',
      'page-1',
      expect.objectContaining({ title: 'Page' }),
    )
  })
})

// ─── upsert on re-sync — no duplicates ───────────────────────────────────────

describe('upsert on re-sync', () => {
  it('deletes old chunks before inserting new ones', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const deleteCall = mockChunkDeleteMany.mock.calls[0]?.[0]
    expect(deleteCall?.where).toMatchObject({ page: { notionPageId: 'page-1' } })
    expect(mockChunkDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockChunkCreate.mock.invocationCallOrder[0],
    )
  })
})

// ─── attribution ─────────────────────────────────────────────────────────────

describe('attribution', () => {
  it('stores syncedBy userId on the NotionPage record', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const upsertData = mockPageUpsert.mock.calls[0]?.[0]?.create
    expect(upsertData?.syncedBy).toBe(USER_ID)
  })
})

// ─── Pinecone embedding ───────────────────────────────────────────────────────

describe('Pinecone embedding', () => {
  it('generates one embedding per chunk and upserts to workspaceId namespace', async () => {
    mockSearch.mockReset()
    mockBlocksList.mockReset()
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [makeBlock('paragraph'), makeBlock('heading_1')],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(2)
    const firstUpsert = mockUpsertEmbedding.mock.calls[0]
    expect(firstUpsert?.[2]).toMatchObject({ workspaceId: WORKSPACE_ID, source: 'notion' })
  })
})

// ─── pagination ───────────────────────────────────────────────────────────────

describe('pagination', () => {
  it('follows next_cursor across multiple pages of search results', async () => {
    mockSearch
      .mockResolvedValueOnce({ results: [makePage('page-1', 'Page 1')], next_cursor: 'cursor-2', has_more: true })
      .mockResolvedValueOnce({ results: [makePage('page-2', 'Page 2')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValue({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    const result = await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockSearch).toHaveBeenCalledTimes(2)
    expect(mockSearch).toHaveBeenNthCalledWith(2, expect.objectContaining({ start_cursor: 'cursor-2' }))
    expect(result.pages).toBe(2)
  })

  it('paginates block children within a page', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList
      .mockResolvedValueOnce({ results: [makeBlock('paragraph')], next_cursor: 'block-cursor', has_more: true })
      .mockResolvedValueOnce({ results: [makeBlock('heading_1')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockBlocksList).toHaveBeenCalledTimes(2)
    expect(mockBlocksList).toHaveBeenNthCalledWith(2, expect.objectContaining({ start_cursor: 'block-cursor' }))
    expect(mockChunkCreate).toHaveBeenCalledTimes(2)
  })
})

// ─── rate limiting ────────────────────────────────────────────────────────────

describe('rate limiting', () => {
  it('retries on 429 with exponential backoff and succeeds', async () => {
    jest.useFakeTimers()
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })

    const rateLimitError = Object.assign(new Error('rate limited'), { status: 429 })
    mockBlocksList
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    const syncPromise = syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)
    await jest.runAllTimersAsync()
    const result = await syncPromise

    expect(mockBlocksList).toHaveBeenCalledTimes(2)
    expect(result.pages).toBe(1)
    jest.useRealTimers()
  })

  it('skips page after exhausting retries and reports as failed', async () => {
    jest.useFakeTimers()
    mockSearch.mockResolvedValueOnce({ results: [makePage('bad', 'Bad')], next_cursor: null, has_more: false })

    const rateLimitError = Object.assign(new Error('rate limited'), { status: 429 })
    mockBlocksList.mockRejectedValue(rateLimitError)

    const syncPromise = syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)
    await jest.runAllTimersAsync()
    const result = await syncPromise

    expect(result.failed).toContain('bad')
    jest.useRealTimers()
  })
})

// ─── page hierarchy ───────────────────────────────────────────────────────────

describe('page hierarchy', () => {
  it('stores parentPageId on nested pages', async () => {
    mockSearch.mockResolvedValueOnce({
      results: [
        makePage('parent-id', 'Parent'),
        makePage('child-id', 'Child', '2026-01-01T00:00:00.000Z', 'parent-id'),
      ],
      next_cursor: null,
      has_more: false,
    })
    mockBlocksList.mockResolvedValue({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const childUpsert = mockPageUpsert.mock.calls.find(
      (call) => call[0]?.create?.notionPageId === 'child-id',
    )
    expect(childUpsert?.[0]?.create?.parentPageId).toBe('parent-id')
  })
})

// ─── edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty page — no chunks created, no Pinecone call', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Empty')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [], next_cursor: null, has_more: false })

    const result = await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockChunkCreate).not.toHaveBeenCalled()
    expect(mockUpsertEmbedding).not.toHaveBeenCalled()
    expect(result.pages).toBe(1)
  })

  it('handles image-only page — creates image chunk even without caption, skips unsupported blocks', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Images')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [
        { type: 'image', id: 'b1', has_children: false, image: { type: 'external', external: { url: 'x' }, caption: [] } },
        { type: 'divider', id: 'b2', has_children: false, divider: {} },
      ],
      next_cursor: null,
      has_more: false,
    })

    const result = await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string; metadata: Record<string, unknown> })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('[Image]')
    expect(chunks[0].metadata.imageUrl).toBe('x')
    expect(result.pages).toBe(1)
  })

  it('continues processing remaining pages when one page fails', async () => {
    mockSearch.mockResolvedValueOnce({
      results: [makePage('bad', 'Bad'), makePage('good', 'Good')],
      next_cursor: null,
      has_more: false,
    })
    mockBlocksList
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    const result = await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(result.failed).toContain('bad')
    expect(result.pages).toBe(1)
  })
})

// ─── ActivityEvent ────────────────────────────────────────────────────────────

describe('ActivityEvent', () => {
  it('creates sync activity event on completion', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('paragraph')], next_cursor: null, has_more: false })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockTrackEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      USER_ID,
      DISPLAY_NAME,
      'sync',
      expect.stringContaining('1'),
      expect.any(Object),
    )
  })
})

// ─── parentChunkId linking ────────────────────────────────────────────────────

describe('parentChunkId linking', () => {
  function makeToggleBlock(id: string, titleText: string) {
    return { type: 'toggle', id, has_children: true, toggle: { rich_text: richText(titleText) } }
  }

  function withChunkCreate(test: (mockCreate: jest.Mock) => Promise<void>) {
    return async () => {
      let count = 0
      const mockCreate = jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: `chunk-${++count}`, ...args.data }),
      )
      const original = (prisma.notionChunk as unknown as Record<string, jest.Mock>).create
      ;(prisma.notionChunk as unknown as Record<string, jest.Mock>).create = mockCreate
      try {
        await test(mockCreate)
      } finally {
        ;(prisma.notionChunk as unknown as Record<string, jest.Mock>).create = original
      }
    }
  }

  it('stores parentChunkId on child chunks pointing to the toggle DB id', withChunkCreate(async (mockCreate) => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeToggleBlock('toggle-1', 'My Toggle')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [{ type: 'paragraph', id: 'para-1', has_children: false, paragraph: { rich_text: richText('Child content') } }],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockCreate).toHaveBeenCalledTimes(2)
    const toggleCall = mockCreate.mock.calls[0][0].data
    const childCall = mockCreate.mock.calls[1][0].data
    expect(toggleCall.blockType).toBe('toggle')
    expect(toggleCall.metadata.parentChunkId).toBeNull()
    expect(childCall.blockType).toBe('paragraph')
    expect(childCall.metadata.parentChunkId).toBe('chunk-1')
  }))

  it('sets parentChunkId to null for all top-level chunks', withChunkCreate(async (mockCreate) => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [makeBlock('paragraph'), makeBlock('heading_1')],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    for (const call of mockCreate.mock.calls) {
      expect(call[0].data.metadata.parentChunkId).toBeNull()
    }
  }))

  it('children of a toggle are NOT stored as top-level (parentChunkId is set)', withChunkCreate(async (mockCreate) => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeToggleBlock('t1', 'LS in 3 unknowns')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [
        { type: 'paragraph', id: 'step-0', has_children: false, paragraph: { rich_text: richText('Step by step solution:') } },
        { type: 'numbered_list_item', id: 'step-4', has_children: false, numbered_list_item: { rich_text: richText('Step four') } },
        { type: 'paragraph', id: 'answer', has_children: false, paragraph: { rich_text: richText('(x, y, z) = (1, 2, 3)') } },
      ],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    // toggle is chunk-1; all three children must have parentChunkId='chunk-1'
    expect(mockCreate).toHaveBeenCalledTimes(4)
    const [toggleCall, ...childCalls] = mockCreate.mock.calls.map((c) => c[0].data)
    expect(toggleCall.metadata.parentChunkId).toBeNull()
    for (const child of childCalls) {
      expect(child.metadata.parentChunkId).toBe('chunk-1')
    }
  }))
})

// ─── toggle block children ────────────────────────────────────────────────────

describe('toggle block children', () => {
  function makeToggle(id: string, titleText: string, hasChildren = true) {
    return {
      type: 'toggle',
      id,
      has_children: hasChildren,
      toggle: { rich_text: richText(titleText) },
    }
  }

  it('fetches children of a toggle block using the toggle block id', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [makeToggle('toggle-1', 'My Toggle')],
      next_cursor: null,
      has_more: false,
    })
    mockBlocksList.mockResolvedValueOnce({
      results: [makeBlock('paragraph')],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockBlocksList).toHaveBeenCalledTimes(2)
    expect(mockBlocksList).toHaveBeenNthCalledWith(2, expect.objectContaining({ block_id: 'toggle-1' }))
  })

  it('indexes content inside a toggle as chunks', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [makeToggle('toggle-1', 'Toggle Title')],
      next_cursor: null,
      has_more: false,
    })
    mockBlocksList.mockResolvedValueOnce({
      results: [{ type: 'paragraph', id: 'p1', has_children: false, paragraph: { rich_text: richText('Content inside toggle') } }],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string; blockType: string })
    expect(chunks.some((c) => c.content.includes('Toggle Title'))).toBe(true)
    expect(chunks.some((c) => c.content.includes('Content inside toggle'))).toBe(true)
  })

  it('indexes a toggle with empty title but non-empty children', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [{ type: 'toggle', id: 'toggle-empty', has_children: true, toggle: { rich_text: [] } }],
      next_cursor: null,
      has_more: false,
    })
    mockBlocksList.mockResolvedValueOnce({
      results: [{ type: 'paragraph', id: 'p1', has_children: false, paragraph: { rich_text: richText('Hidden content') } }],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string })
    expect(chunks.some((c) => c.content.includes('Hidden content'))).toBe(true)
  })

  it('indexes nested bullets inside a toggle', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [makeToggle('toggle-1', 'Toggle')],
      next_cursor: null,
      has_more: false,
    })
    mockBlocksList.mockResolvedValueOnce({
      results: [
        { type: 'bulleted_list_item', id: 'b1', has_children: false, bulleted_list_item: { rich_text: richText('bullet one') } },
        { type: 'bulleted_list_item', id: 'b2', has_children: false, bulleted_list_item: { rich_text: richText('bullet two') } },
      ],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string })
    expect(chunks.some((c) => c.content.includes('bullet one'))).toBe(true)
    expect(chunks.some((c) => c.content.includes('bullet two'))).toBe(true)
  })

  it('does not recurse into child_page blocks', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [{ type: 'child_page', id: 'cp-1', has_children: true, child_page: { title: 'Sub Page' } }],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockBlocksList).toHaveBeenCalledTimes(1)
  })

  it('does not recurse into child_database blocks', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [{ type: 'child_database', id: 'cd-1', has_children: true, child_database: { title: 'My DB' } }],
      next_cursor: null,
      has_more: false,
    })

    await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(mockBlocksList).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 when fetching toggle children', async () => {
    jest.useFakeTimers()
    mockSearch.mockResolvedValueOnce({ results: [makePage('page-1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({
      results: [makeToggle('toggle-1', 'Toggle')],
      next_cursor: null,
      has_more: false,
    })
    const rateLimitError = Object.assign(new Error('rate limited'), { status: 429 })
    mockBlocksList
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        results: [{ type: 'paragraph', id: 'p1', has_children: false, paragraph: { rich_text: richText('Recovered') } }],
        next_cursor: null,
        has_more: false,
      })

    const syncPromise = syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)
    await jest.runAllTimersAsync()
    await syncPromise

    const chunks = mockChunkCreate.mock.calls.map((c) => c[0].data as { content: string })
    expect(chunks.some((c) => c.content.includes('Recovered'))).toBe(true)
    jest.useRealTimers()
  })
})

// ─── return shape ─────────────────────────────────────────────────────────────

describe('return value', () => {
  it('returns { pages, chunks, skipped, failed }', async () => {
    mockSearch.mockResolvedValueOnce({ results: [makePage('p1', 'Page')], next_cursor: null, has_more: false })
    mockBlocksList.mockResolvedValueOnce({ results: [makeBlock('paragraph'), makeBlock('heading_1')], next_cursor: null, has_more: false })
    const result = await syncNotionPages(WORKSPACE_ID, USER_ID, DISPLAY_NAME)

    expect(result).toMatchObject({ pages: 1, chunks: 2, skipped: 1, failed: [] })
    expect(result.skippedReasons).toEqual({ no_extractable_knowledge: 1 })
  })
})
