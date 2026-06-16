import { Client } from '@notionhq/client'
import type {
  PageObjectResponse,
  BlockObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { deleteEmbeddings, upsertEmbedding } from '@/lib/pinecone'
import { trackEvent } from '@/lib/activity'
import { escapeXml } from '@/lib/utils'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import type { SlackMessage } from '@/types'

export interface SyncResult {
  success?: boolean
  fetched?: number
  processed?: number
  knowledgeCreated?: number
  knowledgeUpdated?: number
  chunksExtracted?: number
  extractionEmbeddingErrors?: number
  skippedReasons?: Record<string, number>
  pages: number
  chunks: number
  skipped: number
  failed: string[]
  diagnostics?: NotionSyncDiagnostics
}

export interface NotionSyncDiagnostics {
  pagesFetched: number
  pagesWithTitle: number
  blocksFetched: number
  blocksWithRichText: number
  textCharactersExtracted: number
  chunksCreated: number
  skippedReasons: Record<string, number>
}

interface ChunkData {
  content: string
  blockType: string
  position: number
  metadata: Record<string, unknown>
}

interface PageTextData {
  title: string
  propertyText: string[]
  hasTitle: boolean
}

interface AnnotatedBlock {
  block: BlockObjectResponse
  depth: number
  parentNotionBlockId: string | null
  parentBlockType: string | null
  parentTitle: string | null
}

function richTextToPlain(richText: RichTextItemResponse[]): string {
  return richText.map((t) => t.plain_text).join('')
}

function getPageTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === 'title') return prop.title.map((t) => t.plain_text).join('')
  }
  return 'Untitled'
}

function contentHash(content: string): string {
  return content.slice(0, 100).toLowerCase().replace(/\s+/g, ' ').trim()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pageTextFromProperties(page: PageObjectResponse): PageTextData {
  const propertyText: string[] = []
  let title = 'Untitled'
  let hasTitle = false

  for (const [name, prop] of Object.entries(page.properties)) {
    switch (prop.type) {
      case 'title': {
        const value = richTextToPlain(prop.title).trim()
        if (value) {
          title = value
          hasTitle = true
          propertyText.unshift(value)
        }
        break
      }
      case 'rich_text': {
        const value = richTextToPlain(prop.rich_text).trim()
        if (value) propertyText.push(`${name}: ${value}`)
        break
      }
      case 'select':
        if (prop.select?.name) propertyText.push(`${name}: ${prop.select.name}`)
        break
      case 'multi_select': {
        const value = prop.multi_select.map((item) => item.name).filter(Boolean).join(', ')
        if (value) propertyText.push(`${name}: ${value}`)
        break
      }
      case 'status':
        if (prop.status?.name) propertyText.push(`${name}: ${prop.status.name}`)
        break
    }
  }

  return { title, propertyText, hasTitle }
}

function blockRichText(block: BlockObjectResponse): RichTextItemResponse[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = block as any
  const value = b[block.type]?.rich_text
  return Array.isArray(value) ? value : []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blockToRawChunk(block: BlockObjectResponse): { content: string; metadata: Record<string, unknown> } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = block as any

  switch (block.type) {
    case 'paragraph':
      return { content: richTextToPlain(b.paragraph.rich_text), metadata: {} }
    case 'heading_1':
      return { content: richTextToPlain(b.heading_1.rich_text), metadata: { level: 1 } }
    case 'heading_2':
      return { content: richTextToPlain(b.heading_2.rich_text), metadata: { level: 2 } }
    case 'heading_3':
      return { content: richTextToPlain(b.heading_3.rich_text), metadata: { level: 3 } }
    case 'bulleted_list_item':
      return { content: richTextToPlain(b.bulleted_list_item.rich_text), metadata: {} }
    case 'numbered_list_item':
      return { content: richTextToPlain(b.numbered_list_item.rich_text), metadata: {} }
    case 'to_do':
      return { content: richTextToPlain(b.to_do.rich_text), metadata: { checked: Boolean(b.to_do.checked) } }
    case 'callout':
      return { content: richTextToPlain(b.callout.rich_text), metadata: {} }
    case 'code':
      return { content: richTextToPlain(b.code.rich_text), metadata: { language: b.code.language as string } }
    case 'toggle':
      return { content: richTextToPlain(b.toggle.rich_text), metadata: {} }
    case 'quote':
      return { content: richTextToPlain(b.quote.rich_text), metadata: {} }
    case 'image': {
      const caption = (b.image.caption as RichTextItemResponse[]) ?? []
      const imageUrl: string =
        b.image.type === 'external'
          ? (b.image.external.url as string)
          : ((b.image.file?.url as string) ?? '')
      const content = caption.length > 0 ? richTextToPlain(caption) : '[Image]'
      return { content, metadata: { imageUrl } }
    }
    case 'embed':
      return { content: b.embed.url as string, metadata: {} }
    case 'table_row': {
      const cells = b.table_row.cells as RichTextItemResponse[][]
      return { content: cells.map((cell) => richTextToPlain(cell)).join(' | '), metadata: {} }
    }
    case 'child_page':
      return { content: b.child_page.title as string, metadata: {} }
    default:
      return null
  }
}

function extractChunks(annotatedBlocks: AnnotatedBlock[], pageText: PageTextData): ChunkData[] {
  const chunks: ChunkData[] = []

  for (const { block, depth, parentNotionBlockId, parentBlockType, parentTitle } of annotatedBlocks) {
    const raw = blockToRawChunk(block)
    if (!raw || !raw.content.trim()) continue

    const metadata: Record<string, unknown> = { ...raw.metadata, notionBlockId: block.id }
    if (parentNotionBlockId) {
      metadata.parentNotionBlockId = parentNotionBlockId
      metadata.parentBlockType = parentBlockType
      metadata.parentTitle = parentTitle
      metadata.depth = depth
    }

    chunks.push({
      content: escapeXml(raw.content),
      blockType: block.type,
      position: chunks.length,
      metadata,
    })
  }

  const propertyContent = pageText.propertyText.join('\n').trim()
  const hasDatabaseProperties = pageText.propertyText.length > 1
  if (propertyContent && (chunks.length === 0 || hasDatabaseProperties)) {
    return [
      {
        content: escapeXml(propertyContent),
        blockType: 'page_properties',
        position: 0,
        metadata: { source: 'page_properties' },
      },
      ...chunks.map((chunk, index) => ({ ...chunk, position: index + 1 })),
    ]
  }

  return chunks
}

function emptyNotionDiagnostics(): NotionSyncDiagnostics {
  return {
    pagesFetched: 0,
    pagesWithTitle: 0,
    blocksFetched: 0,
    blocksWithRichText: 0,
    textCharactersExtracted: 0,
    chunksCreated: 0,
    skippedReasons: {},
  }
}

function incrementReason(target: Record<string, number>, reason: string, count = 1) {
  target[reason] = (target[reason] ?? 0) + count
}

function addNotionDiagnostics(target: NotionSyncDiagnostics, source: NotionSyncDiagnostics) {
  target.pagesFetched += source.pagesFetched
  target.pagesWithTitle += source.pagesWithTitle
  target.blocksFetched += source.blocksFetched
  target.blocksWithRichText += source.blocksWithRichText
  target.textCharactersExtracted += source.textCharactersExtracted
  target.chunksCreated += source.chunksCreated
  for (const [reason, count] of Object.entries(source.skippedReasons)) {
    incrementReason(target.skippedReasons, reason, count)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function emptyExtractionDiagnostics(): ExtractionDiagnostics {
  return {
    extractorCalled: 0,
    extractorReturnedEmpty: 0,
    extractorParseFailed: 0,
    validationFailed: 0,
    knowledgeItemCreateFailed: 0,
    embeddingUpsertFailed: 0,
    itemProcessingFailed: 0,
  }
}

function addExtractionDiagnostics(target: ExtractionDiagnostics, source: ExtractionDiagnostics) {
  for (const key of Object.keys(target) as Array<keyof ExtractionDiagnostics>) {
    target[key] += source[key] ?? 0
  }
}

function extractionErrorCount(diagnostics: ExtractionDiagnostics) {
  return diagnostics.extractorParseFailed
    + diagnostics.validationFailed
    + diagnostics.knowledgeItemCreateFailed
    + diagnostics.embeddingUpsertFailed
    + diagnostics.itemProcessingFailed
}

// These block types appear as separate pages in the search API — skip recursing to avoid double-indexing.
const SKIP_CHILDREN_TYPES = new Set(['child_page', 'child_database'])

async function fetchDirectChildren(notion: Client, blockId: string): Promise<BlockObjectResponse[]> {
  const MAX_ATTEMPTS = 3
  const blocks: BlockObjectResponse[] = []
  let cursor: string | undefined

  do {
    let response: Awaited<ReturnType<typeof notion.blocks.children.list>>
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        response = await notion.blocks.children.list({
          block_id: blockId,
          start_cursor: cursor,
          page_size: 100,
        })
        break
      } catch (err: unknown) {
        const isRateLimit = (err as { status?: number }).status === 429
        if (!isRateLimit || attempt === MAX_ATTEMPTS) throw err
        await sleep(Math.pow(2, attempt - 1) * 1000)
      }
    }
    blocks.push(...(response!.results as BlockObjectResponse[]))
    cursor = response!.next_cursor ?? undefined
  } while (cursor)

  return blocks
}

async function fetchAllAnnotatedBlocks(
  notion: Client,
  blockId: string,
  depth = 0,
  parentNotionBlockId: string | null = null,
  parentBlockType: string | null = null,
  parentTitle: string | null = null,
): Promise<AnnotatedBlock[]> {
  const direct = await fetchDirectChildren(notion, blockId)
  const all: AnnotatedBlock[] = []

  for (const block of direct) {
    all.push({ block, depth, parentNotionBlockId, parentBlockType, parentTitle })

    if (block.has_children && !SKIP_CHILDREN_TYPES.has(block.type)) {
      const blockRaw = blockToRawChunk(block)
      const blockTitle = blockRaw?.content ?? null
      // Cap nesting at depth 3 to avoid runaway recursion on deeply nested pages
      if (depth < 3) {
        const children = await fetchAllAnnotatedBlocks(
          notion,
          block.id,
          depth + 1,
          block.id,
          block.type,
          blockTitle,
        )
        all.push(...children)
      }
    }
  }

  return all
}

function getParentPageId(page: PageObjectResponse): string | null {
  if (page.parent.type === 'page_id') {
    return (page.parent as { type: 'page_id'; page_id: string }).page_id
  }
  return null
}

function notionExtractionMessages(content: string, title: string, lastEditedAt: string, url: string): SlackMessage[] {
  const paragraphs = content.split('\n').filter(Boolean)
  const grouped: string[] = []
  for (const paragraph of paragraphs) {
    const current = grouped[grouped.length - 1]
    if (!current || current.length + paragraph.length > 12_000) grouped.push(paragraph)
    else grouped[grouped.length - 1] = `${current}\n${paragraph}`
  }
  return grouped.map((text) => ({
    text,
    user: 'Notion',
    channel: title,
    ts: String(new Date(lastEditedAt).getTime() / 1000),
    permalink: url,
  }))
}

async function createPropertyFallbackKnowledgeItem(input: {
  workspaceId: string
  content: string
  url: string
  pageId: string
  dbPageId: string
  title: string
  lastEditedAt: string
}): Promise<number> {
  const content = input.content.trim()
  if (!content) return 0

  const hash = contentHash(content)
  const existing = await prisma.knowledgeItem.findUnique({
    where: { workspaceId_contentHash: { workspaceId: input.workspaceId, contentHash: hash } },
    select: { id: true },
  })
  if (existing) return 0

  const embedding = await generateEmbedding(content)
  const dbItem = await prisma.knowledgeItem.create({
    data: {
      workspaceId: input.workspaceId,
      content,
      contentHash: hash,
      category: 'reference',
      source: 'notion',
      sourceUrl: input.url,
      sourceExternalId: input.pageId,
      notionPageId: input.dbPageId,
      notionPageTitle: input.title,
      confidence: 0.7,
      sourceCreatedAt: new Date(input.lastEditedAt),
    },
    select: { id: true },
  })

  try {
    await upsertEmbedding(dbItem.id, embedding, {
      workspaceId: input.workspaceId,
      category: 'reference',
      source: 'notion',
    })
    await prisma.knowledgeItem.update({
      where: { id: dbItem.id },
      data: { embeddingId: dbItem.id },
    })
    return 1
  } catch (err) {
    await prisma.knowledgeItem.delete({ where: { id: dbItem.id } }).catch(() => null)
    throw err
  }
}

export async function syncNotionPages(
  workspaceId: string,
  userId: string,
  displayName: string,
  accessToken?: string,
): Promise<SyncResult> {
  const token = accessToken ?? (process.env.NODE_ENV === 'test' ? process.env.NOTION_TOKEN : undefined)
  if (!token) throw new Error('Notion access token is not configured')

  const notion = new Client({ auth: token })

  let totalPages = 0
  let totalChunks = 0
  let skipped = 0
  let pagesFound = 0
  let knowledgeCreated = 0
  let knowledgeUpdated = 0
  const skippedReasons: Record<string, number> = {}
  const extractionDiagnostics = emptyExtractionDiagnostics()
  const notionDiagnostics = emptyNotionDiagnostics()
  const failed: string[] = []
  let cursor: string | undefined

  do {
    const response = await notion.search({
      filter: { property: 'object', value: 'page' },
      start_cursor: cursor,
      page_size: 100,
    })

    for (const result of response.results) {
      if (result.object !== 'page') continue
      const page = result as PageObjectResponse
      pagesFound++
      const pageText = pageTextFromProperties(page)
      const pageDiagnostics = emptyNotionDiagnostics()
      pageDiagnostics.pagesFetched = 1
      pageDiagnostics.pagesWithTitle = pageText.hasTitle ? 1 : 0

      const existing = await prisma.notionPage.findUnique({
        where: { workspaceId_notionPageId: { workspaceId, notionPageId: page.id } },
      })
      const existingKnowledgeCount = existing
        ? await prisma.knowledgeItem.count({ where: { workspaceId, source: 'notion', sourceExternalId: page.id } })
        : 0
      if (existing && new Date(page.last_edited_time).getTime() === existing.lastEditedAt.getTime()) {
        if (existingKnowledgeCount > 0) {
          skipped++
          incrementReason(skippedReasons, 'unchanged_with_existing_knowledge')
          incrementReason(pageDiagnostics.skippedReasons, 'unchanged_with_existing_knowledge')
          addNotionDiagnostics(notionDiagnostics, pageDiagnostics)
          continue
        }
        const extraction = await extractKnowledgeDetailed(
          notionExtractionMessages(existing.content, existing.title, page.last_edited_time, page.url),
          workspaceId,
          'notion',
          page.url,
          page.id,
          { id: existing.id, title: existing.title },
        )
        addExtractionDiagnostics(extractionDiagnostics, extraction.diagnostics)
        knowledgeCreated += extraction.items.length
        if (extraction.items.length === 0) {
          skipped++
          incrementReason(skippedReasons, 'unchanged_no_extractable_knowledge')
          incrementReason(pageDiagnostics.skippedReasons, 'unchanged_no_extractable_knowledge')
        }
        pageDiagnostics.textCharactersExtracted += existing.content.length
        addNotionDiagnostics(notionDiagnostics, pageDiagnostics)
        totalPages++
        continue
      }

      try {
        const annotatedBlocks = await fetchAllAnnotatedBlocks(notion, page.id)
        pageDiagnostics.blocksFetched += annotatedBlocks.length
        pageDiagnostics.blocksWithRichText += annotatedBlocks.filter(({ block }) => blockRichText(block).some((text) => text.plain_text.trim())).length
        const blocks = annotatedBlocks.map((a) => a.block)
        const chunks = extractChunks(annotatedBlocks, pageText)
        const title = pageText.title
        const content = chunks.map((c) => c.content).join('\n')
        pageDiagnostics.textCharactersExtracted += chunks.reduce((total, chunk) => total + chunk.content.length, 0)
        pageDiagnostics.chunksCreated += chunks.length
        const parentPageId = getParentPageId(page)

        const dbPage = await prisma.notionPage.upsert({
          where: { workspaceId_notionPageId: { workspaceId, notionPageId: page.id } },
          create: {
            notionPageId: page.id,
            workspaceId,
            title,
            parentPageId,
            content,
            blockStructure: blocks as unknown as Prisma.InputJsonValue,
            iconUrl: null,
            lastEditedAt: new Date(page.last_edited_time),
            syncedBy: userId,
            syncedAt: new Date(),
          },
          update: {
            title,
            parentPageId,
            content,
            blockStructure: blocks as unknown as Prisma.InputJsonValue,
            lastEditedAt: new Date(page.last_edited_time),
            syncedBy: userId,
            syncedAt: new Date(),
          },
        })

        if (chunks.length > 0) {
          await prisma.notionChunk.deleteMany({
            where: { page: { notionPageId: page.id } },
          })

          // Maps notionBlockId → DB chunk id so children can reference their parent.
          const notionBlockToChunkId = new Map<string, string>()

          for (const chunk of chunks) {
            const pineconeId = `${workspaceId}-${page.id}-${chunk.position}`
            const embedding = await generateEmbedding(chunk.content)
            await upsertEmbedding(pineconeId, embedding, { workspaceId, source: 'notion' })

            const parentNotionBlockId = chunk.metadata.parentNotionBlockId as string | undefined
            const parentChunkId = parentNotionBlockId
              ? (notionBlockToChunkId.get(parentNotionBlockId) ?? null)
              : null

            const created = await prisma.notionChunk.create({
              data: {
                notionPageId: dbPage.id,
                workspaceId,
                content: chunk.content,
                blockType: chunk.blockType,
                position: chunk.position,
                metadata: { ...chunk.metadata, parentChunkId } as Prisma.InputJsonValue,
                pineconeId,
                visibility: 'team',
                labels: [] as Prisma.InputJsonValue,
                labeledBy: [] as Prisma.InputJsonValue,
              },
            })

            totalChunks++

            const notionBlockId = chunk.metadata.notionBlockId as string | undefined
            if (notionBlockId) notionBlockToChunkId.set(notionBlockId, created.id)
          }

          const priorKnowledge = await prisma.knowledgeItem.findMany({
            where: { workspaceId, source: 'notion', sourceExternalId: page.id },
            select: { id: true, embeddingId: true },
          })
          await deleteEmbeddings(priorKnowledge.map((item) => item.embeddingId ?? item.id))
          await prisma.knowledgeItem.deleteMany({
            where: { id: { in: priorKnowledge.map((item) => item.id) }, workspaceId },
          })
          const extraction = await extractKnowledgeDetailed(
            notionExtractionMessages(content, title, page.last_edited_time, page.url),
            workspaceId,
            'notion',
            page.url,
            page.id,
            { id: dbPage.id, title },
          )
          addExtractionDiagnostics(extractionDiagnostics, extraction.diagnostics)
          let fallbackCreated = 0
          const hasOnlyPropertyText = chunks.length > 0 && chunks.every((chunk) => chunk.blockType === 'page_properties')
          if (extraction.items.length === 0 && hasOnlyPropertyText) {
            fallbackCreated = await createPropertyFallbackKnowledgeItem({
              workspaceId,
              content,
              url: page.url,
              pageId: page.id,
              dbPageId: dbPage.id,
              title,
              lastEditedAt: page.last_edited_time,
            })
          }
          if (priorKnowledge.length > 0) {
            knowledgeUpdated += extraction.items.length + fallbackCreated
          } else {
            knowledgeCreated += extraction.items.length + fallbackCreated
          }
          if (extraction.items.length === 0 && fallbackCreated === 0) {
            skipped++
            incrementReason(skippedReasons, 'no_extractable_knowledge')
            incrementReason(pageDiagnostics.skippedReasons, 'no_extractable_knowledge')
          }
        } else {
          skipped++
          incrementReason(skippedReasons, 'no_supported_blocks')
          incrementReason(pageDiagnostics.skippedReasons, 'no_supported_blocks')
        }

        addNotionDiagnostics(notionDiagnostics, pageDiagnostics)
        totalPages++
      } catch (err) {
        console.error(`[notion/sync] page ${page.id} failed:`, err)
        failed.push(page.id)
        incrementReason(skippedReasons, 'page_failed')
        incrementReason(pageDiagnostics.skippedReasons, 'page_failed')
        addNotionDiagnostics(notionDiagnostics, pageDiagnostics)
      }
    }

    cursor = response.next_cursor ?? undefined
  } while (cursor)

  await trackEvent(workspaceId, userId, displayName, 'sync',
    `Synced ${totalPages} pages with ${totalChunks} chunks from Notion`,
    { pages: totalPages, chunks: totalChunks, skipped, failed })

  const extractionEmbeddingErrors = extractionErrorCount(extractionDiagnostics)
  console.info('[notion/sync] summary', {
    workspaceId,
    integration: 'notion',
    rawItemsFetched: pagesFound,
    pagesWithTitle: notionDiagnostics.pagesWithTitle,
    blocksFetched: notionDiagnostics.blocksFetched,
    blocksWithRichText: notionDiagnostics.blocksWithRichText,
    textCharactersExtracted: notionDiagnostics.textCharactersExtracted,
    chunksExtracted: totalChunks,
    knowledgeItemsCreated: knowledgeCreated,
    knowledgeItemsUpdated: knowledgeUpdated,
    skipped,
    skippedReasons,
    extractionEmbeddingErrors,
  })

  if (pagesFound > 0 && totalChunks > 0 && knowledgeCreated + knowledgeUpdated === 0 && extractionEmbeddingErrors > 0) {
    throw new Error('Notion sync fetched pages, but extraction failed for every item.')
  }

  return {
    success: true,
    fetched: pagesFound,
    processed: totalPages,
    knowledgeCreated,
    knowledgeUpdated,
    chunksExtracted: totalChunks,
    extractionEmbeddingErrors,
    skippedReasons,
    pages: totalPages,
    chunks: totalChunks,
    skipped,
    failed,
    diagnostics: { ...notionDiagnostics, skippedReasons },
  }
}
