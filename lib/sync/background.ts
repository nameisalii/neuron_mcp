import { Client } from '@notionhq/client'
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { deleteEmbeddings, upsertEmbedding } from '@/lib/pinecone'
import { extractKnowledge } from '@/lib/extraction/extractor'
import { evaluateCapture } from './capture-rules'
import { detectConflicts } from '@/lib/alerts/conflict-detector'
import type { SyncResult } from '@/lib/notion/sync'
import { escapeXml } from '@/lib/utils'
import type { BlockObjectResponse, RichTextItemResponse } from '@notionhq/client/build/src/api-endpoints'
import { getConnectedIntegrationToken } from '@/lib/integrations/connection-server'

export interface SlackMessageEvent {
  channel: string
  user: string
  text: string
  ts: string
}

// ─── helpers (mirrors lib/notion/sync.ts internals) ───────────────────────────

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
function blockToContent(block: BlockObjectResponse): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = block as any
  switch (block.type) {
    case 'paragraph': return richTextToPlain(b.paragraph.rich_text)
    case 'heading_1': return richTextToPlain(b.heading_1.rich_text)
    case 'heading_2': return richTextToPlain(b.heading_2.rich_text)
    case 'heading_3': return richTextToPlain(b.heading_3.rich_text)
    case 'bulleted_list_item': return richTextToPlain(b.bulleted_list_item.rich_text)
    case 'numbered_list_item': return richTextToPlain(b.numbered_list_item.rich_text)
    case 'callout': return richTextToPlain(b.callout.rich_text)
    case 'toggle': return richTextToPlain(b.toggle.rich_text)
    case 'quote': return richTextToPlain(b.quote.rich_text)
    default: return null
  }
}

async function fetchAllBlocks(notion: Client, pageId: string): Promise<BlockObjectResponse[]> {
  const blocks: BlockObjectResponse[] = []
  let cursor: string | undefined
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 })
    blocks.push(...(res.results as BlockObjectResponse[]))
    cursor = res.next_cursor ?? undefined
  } while (cursor)
  return blocks
}

async function writeCaptureLog(
  workspaceId: string,
  source: string,
  sourceId: string,
  contentPreview: string,
  status: string,
  reason: string,
  captureRuleId?: string,
): Promise<void> {
  try {
    await prisma.captureLog.create({
      data: { workspaceId, source, sourceId, contentPreview, status, reason, captureRuleId: captureRuleId ?? null },
    })
  } catch (err) {
    console.error('[sync/background] captureLog.create failed', err)
  }
}

// ─── Notion background sync ───────────────────────────────────────────────────

export async function runNotionBackgroundSync(workspaceId: string): Promise<SyncResult> {
  const syncStatus = await prisma.syncStatus.findUnique({
    where: { workspaceId_integration: { workspaceId, integration: 'notion' } },
  })

  if (syncStatus?.status === 'paused') {
    return { pages: 0, chunks: 0, skipped: 0, failed: [] }
  }

  const sinceDate = syncStatus?.lastSyncAt ?? new Date(Date.now() - 5 * 60 * 1000)
  const syncedBy = syncStatus?.configuredBy ?? 'system'
  const now = new Date()

  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: 'notion' } },
    select: { type: true, accessToken: true, metadata: true },
  })
  const token = getConnectedIntegrationToken(integration)
  if (!token) throw new Error('Notion is not connected')
  const notion = new Client({ auth: token })

  let totalPages = 0
  let totalChunks = 0
  let skipped = 0
  const failed: string[] = []
  let cursor: string | undefined

  do {
    const response = await notion.search({
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      start_cursor: cursor,
      page_size: 100,
    })

    for (const result of response.results) {
      if (result.object !== 'page') continue
      const page = result as PageObjectResponse

      // Client-side timestamp filter — Notion search API has no server-side after filter
      if (new Date(page.last_edited_time) <= sinceDate) {
        skipped++
        continue
      }

      const title = getPageTitle(page)
      const preview = title.slice(0, 50)

      const decision = await evaluateCapture(workspaceId, {
        integration: 'notion',
        sourceId: page.id,
        contentPreview: preview,
      })

      await writeCaptureLog(workspaceId, 'notion', page.id, preview, decision.decision, decision.reason, decision.ruleId)

      if (decision.decision !== 'capture') {
        skipped++
        continue
      }

      try {
        const blocks = await fetchAllBlocks(notion, page.id)
        const chunks: Array<{ content: string; blockType: string; position: number }> = []

        for (const block of blocks) {
          const raw = blockToContent(block)
          if (!raw?.trim()) continue
          chunks.push({ content: escapeXml(raw), blockType: block.type, position: chunks.length })
        }

        const content = chunks.map((c) => c.content).join('\n')
        const parentPageId =
          page.parent.type === 'page_id'
            ? (page.parent as { type: 'page_id'; page_id: string }).page_id
            : null

        const dbPage = await prisma.notionPage.upsert({
          where: { workspaceId_notionPageId: { workspaceId, notionPageId: page.id } },
          create: {
            notionPageId: page.id, workspaceId, title, parentPageId, content,
            blockStructure: blocks as unknown as Prisma.InputJsonValue,
            iconUrl: null, lastEditedAt: new Date(page.last_edited_time),
            syncedBy, syncedAt: now,
          },
          update: {
            title, parentPageId, content,
            blockStructure: blocks as unknown as Prisma.InputJsonValue,
            lastEditedAt: new Date(page.last_edited_time), syncedBy, syncedAt: now,
          },
        })

        if (chunks.length > 0) {
          await prisma.notionChunk.deleteMany({ where: { page: { notionPageId: page.id } } })

          const chunkRecords = []
          for (const chunk of chunks) {
            const pineconeId = `${workspaceId}-${page.id}-${chunk.position}`
            const embedding = await generateEmbedding(chunk.content)
            await upsertEmbedding(pineconeId, embedding, { workspaceId, source: 'notion' })
            chunkRecords.push({
              notionPageId: dbPage.id, workspaceId,
              content: chunk.content, blockType: chunk.blockType, position: chunk.position,
              metadata: {} as Prisma.InputJsonValue, pineconeId,
              visibility: 'team', labels: [] as Prisma.InputJsonValue, labeledBy: [] as Prisma.InputJsonValue,
            })
          }

          const created = await prisma.notionChunk.createMany({ data: chunkRecords })
          totalChunks += created.count

          // Fire-and-forget conflict detection for each new chunk
          const savedChunks = await prisma.notionChunk.findMany({
            where: { notionPageId: dbPage.id, workspaceId },
            select: { id: true },
          })
          for (const saved of savedChunks) {
            void detectConflicts(workspaceId, saved.id)
          }

          const priorKnowledge = await prisma.knowledgeItem.findMany({
            where: { workspaceId, source: 'notion', sourceExternalId: page.id },
            select: { id: true, embeddingId: true },
          })
          await deleteEmbeddings(priorKnowledge.map((item) => item.embeddingId ?? item.id))
          await prisma.knowledgeItem.deleteMany({
            where: { id: { in: priorKnowledge.map((item) => item.id) }, workspaceId },
          })
          await extractKnowledge(
            chunks.map((chunk) => ({
              text: chunk.content,
              user: 'Notion',
              channel: title,
              ts: String(new Date(page.last_edited_time).getTime() / 1000),
              permalink: page.url,
            })),
            workspaceId,
            'notion',
            page.url,
            page.id,
            { id: dbPage.id, title },
          )
        }

        totalPages++
      } catch (err) {
        console.error(`[sync/background] notion page ${page.id} failed:`, err)
        failed.push(page.id)
      }
    }

    cursor = response.next_cursor ?? undefined

    // Stop early once we reach pages older than sinceDate (results are sorted descending)
    const lastResult = response.results[response.results.length - 1] as PageObjectResponse | undefined
    if (lastResult && new Date(lastResult.last_edited_time) <= sinceDate) break
  } while (cursor)

  await prisma.syncStatus.upsert({
    where: { workspaceId_integration: { workspaceId, integration: 'notion' } },
    create: {
      workspaceId, integration: 'notion', mode: 'background',
      status: 'active', lastSyncAt: now, nextSyncAt: new Date(now.getTime() + 5 * 60 * 1000),
      configuredBy: syncedBy,
    },
    update: { lastSyncAt: now, nextSyncAt: new Date(now.getTime() + 5 * 60 * 1000), status: 'active', errorMessage: null },
  })

  return { pages: totalPages, chunks: totalChunks, skipped, failed }
}

// ─── Slack message processor ──────────────────────────────────────────────────

export async function processSlackMessage(
  workspaceId: string,
  event: SlackMessageEvent,
): Promise<void> {
  const syncStatus = await prisma.syncStatus.findUnique({
    where: { workspaceId_integration: { workspaceId, integration: 'slack' } },
  })

  if (syncStatus?.status === 'paused') return

  const preview = event.text.slice(0, 50)

  const decision = await evaluateCapture(workspaceId, {
    integration: 'slack',
    sourceId: event.channel,
    contentPreview: preview,
  })

  await writeCaptureLog(workspaceId, 'slack', event.channel, preview, decision.decision, decision.reason, decision.ruleId)

  if (decision.decision !== 'capture') return

  try {
    await extractKnowledge(
      [{ text: event.text, user: event.user, channel: event.channel, ts: event.ts }],
      workspaceId,
    )
  } catch (err) {
    console.error('[sync/background] slack extractKnowledge failed', err)
  }

  await prisma.syncStatus.upsert({
    where: { workspaceId_integration: { workspaceId, integration: 'slack' } },
    create: {
      workspaceId, integration: 'slack', mode: 'background',
      status: 'active', lastSyncAt: new Date(), configuredBy: 'system',
    },
    update: { lastSyncAt: new Date() },
  })
}
