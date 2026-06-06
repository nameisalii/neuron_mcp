import { Client } from '@notionhq/client'
import type {
  PageObjectResponse,
  BlockObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { trackEvent } from '@/lib/activity'

export interface SyncResult {
  pages: number
  chunks: number
  skipped: number
  failed: string[]
}

interface ChunkData {
  content: string
  blockType: string
  position: number
  metadata: Record<string, unknown>
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
      if (caption.length === 0) return null
      return { content: richTextToPlain(caption), metadata: {} }
    }
    case 'embed':
      return { content: b.embed.url as string, metadata: {} }
    case 'table_row': {
      const cells = b.table_row.cells as RichTextItemResponse[][]
      return { content: cells.map((cell) => richTextToPlain(cell)).join(' | '), metadata: {} }
    }
    default:
      return null
  }
}

function extractChunks(blocks: BlockObjectResponse[]): ChunkData[] {
  const chunks: ChunkData[] = []
  for (const block of blocks) {
    const raw = blockToRawChunk(block)
    if (!raw || !raw.content.trim()) continue
    chunks.push({
      content: escapeXml(raw.content),
      blockType: block.type,
      position: chunks.length,
      metadata: raw.metadata,
    })
  }
  return chunks
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function fetchAllBlocks(notion: Client, blockId: string): Promise<BlockObjectResponse[]> {
  const direct = await fetchDirectChildren(notion, blockId)
  const all: BlockObjectResponse[] = []

  for (const block of direct) {
    all.push(block)
    if (block.has_children && !SKIP_CHILDREN_TYPES.has(block.type)) {
      const children = await fetchAllBlocks(notion, block.id)
      all.push(...children)
    }
  }

  return all
}

async function fetchBlocksWithRetry(notion: Client, pageId: string): Promise<BlockObjectResponse[]> {
  return fetchAllBlocks(notion, pageId)
}

function getParentPageId(page: PageObjectResponse): string | null {
  if (page.parent.type === 'page_id') {
    return (page.parent as { type: 'page_id'; page_id: string }).page_id
  }
  return null
}

export async function syncNotionPages(
  workspaceId: string,
  userId: string,
  displayName: string,
): Promise<SyncResult> {
  const token = process.env.NOTION_TOKEN
  if (!token) throw new Error('NOTION_TOKEN is not configured')

  const notion = new Client({ auth: token })

  let totalPages = 0
  let totalChunks = 0
  let skipped = 0
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

      const existing = await prisma.notionPage.findUnique({
        where: { workspaceId_notionPageId: { workspaceId, notionPageId: page.id } },
      })
      if (existing && new Date(page.last_edited_time).getTime() === existing.lastEditedAt.getTime()) {
        skipped++
        continue
      }

      try {
        const blocks = await fetchBlocksWithRetry(notion, page.id)
        const chunks = extractChunks(blocks)
        const title = getPageTitle(page)
        const content = chunks.map((c) => c.content).join('\n')
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

          const chunkRecords = []
          for (const chunk of chunks) {
            const pineconeId = `${workspaceId}-${page.id}-${chunk.position}`
            const embedding = await generateEmbedding(chunk.content)
            await upsertEmbedding(pineconeId, embedding, { workspaceId, source: 'notion' })

            chunkRecords.push({
              notionPageId: dbPage.id,
              workspaceId,
              content: chunk.content,
              blockType: chunk.blockType,
              position: chunk.position,
              metadata: chunk.metadata as Prisma.InputJsonValue,
              pineconeId,
              visibility: 'team',
              labels: [] as Prisma.InputJsonValue,
              labeledBy: [] as Prisma.InputJsonValue,
            })
          }

          const created = await prisma.notionChunk.createMany({ data: chunkRecords })
          totalChunks += created.count
        }

        totalPages++
      } catch (err) {
        console.error(`[notion/sync] page ${page.id} failed:`, err)
        failed.push(page.id)
      }
    }

    cursor = response.next_cursor ?? undefined
  } while (cursor)

  await trackEvent(workspaceId, userId, displayName, 'sync',
    `Synced ${totalPages} pages with ${totalChunks} chunks from Notion`,
    { pages: totalPages, chunks: totalChunks, skipped, failed })

  return { pages: totalPages, chunks: totalChunks, skipped, failed }
}
