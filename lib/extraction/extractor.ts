import { z } from 'zod'
import { openai, generateEmbedding } from '@/lib/openai'
import { prisma } from '@/lib/db'
import { upsertEmbedding, upsertEmbeddingInNamespace, searchSimilar, searchInNamespace } from '@/lib/pinecone'
import { EXTRACTION_SYSTEM_PROMPT, GMAIL_EXTRACTION_SYSTEM_PROMPT, CONFLICT_SYSTEM_PROMPT } from './prompts'
import { escapeXml } from '@/lib/utils'
import type { SlackMessage, ExtractedItem } from '@/types'

const CHUNK_SIZE = 20
const CONFIDENCE_THRESHOLD = 0.4
const CONFLICT_TOP_K = 3
const DUPLICATE_THRESHOLD = 0.95

const extractedItemSchema = z.object({
  content: z.string().min(1),
  category: z.enum(['rule', 'decision', 'process', 'idea', 'plan', 'follow_up', 'status_update', 'reference', 'fact']),
  owner: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

function computeContentHash(content: string): string {
  return content.slice(0, 100).toLowerCase().replace(/\s+/g, ' ').trim()
}

function formatMessages(messages: SlackMessage[]): string {
  return messages
    .map((m) => `${escapeXml(m.user)} (${escapeXml(m.channel)}): ${escapeXml(m.text.slice(0, 4000))}`)
    .join('\n')
}

async function checkConflict(a: string, b: string): Promise<boolean> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: CONFLICT_SYSTEM_PROMPT },
      { role: 'user', content: `<statement_a>${a}</statement_a>\n<statement_b>${b}</statement_b>` },
    ],
    temperature: 0,
    max_tokens: 60,
  })
  const text = response.choices[0]?.message?.content ?? ''
  return text.includes('CONFLICT: YES')
}

export interface ExtractionDiagnostics {
  extractorCalled: number
  extractorReturnedEmpty: number
  extractorParseFailed: number
  validationFailed: number
  knowledgeItemCreateFailed: number
  embeddingUpsertFailed: number
  itemProcessingFailed: number
}

export interface ExtractionResult {
  items: ExtractedItem[]
  diagnostics: ExtractionDiagnostics
}

function emptyDiagnostics(): ExtractionDiagnostics {
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

async function extractChunk(messages: SlackMessage[], source: string): Promise<{
  items: ExtractedItem[]
  parseFailed: boolean
  validationFailed: boolean
}> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: source === 'gmail' ? GMAIL_EXTRACTION_SYSTEM_PROMPT : EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: `<messages>\n${formatMessages(messages)}\n</messages>` },
    ],
    temperature: 0.1,
    max_tokens: 1000,
  })
  const raw = response.choices[0]?.message?.content ?? '[]'
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error('[extractChunk] Failed to parse LLM output', err)
    return { items: [], parseFailed: true, validationFailed: false }
  }
  try {
    const validated = z.array(extractedItemSchema).parse(parsed)
    return {
      items: validated.filter((item) => item.confidence >= CONFIDENCE_THRESHOLD) as ExtractedItem[],
      parseFailed: false,
      validationFailed: false,
    }
  } catch (err) {
    console.error('[extractChunk] Failed to validate LLM output', err)
    return { items: [], parseFailed: false, validationFailed: true }
  }
}

export interface ExtractionPrivacyOptions {
  // Pinecone namespace for extracted vectors; defaults to the team namespace
  namespace?: string
  visibility?: 'team' | 'personal'
  visibilitySetBy?: string
}

export async function extractKnowledge(
  messages: SlackMessage[],
  workspaceId: string,
  source = 'slack',
  sourceUrl?: string,
  sourceExternalId?: string,
  notionPage?: { id: string; title: string },
  privacy?: ExtractionPrivacyOptions,
): Promise<ExtractedItem[]> {
  const result = await extractKnowledgeDetailed(
    messages,
    workspaceId,
    source,
    sourceUrl,
    sourceExternalId,
    notionPage,
    privacy,
  )
  return result.items
}

export async function extractKnowledgeDetailed(
  messages: SlackMessage[],
  workspaceId: string,
  source = 'slack',
  sourceUrl?: string,
  sourceExternalId?: string,
  notionPage?: { id: string; title: string },
  privacy?: ExtractionPrivacyOptions,
): Promise<ExtractionResult> {
  const saved: ExtractedItem[] = []
  const diagnostics = emptyDiagnostics()

  const chunks: SlackMessage[][] = []
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + CHUNK_SIZE))
  }

  for (const chunk of chunks) {
    const batchSourceCreatedAt = chunk.length > 0 && chunk[0].ts
      ? new Date(parseFloat(chunk[0].ts) * 1000)
      : null

    let items: ExtractedItem[]
    try {
      diagnostics.extractorCalled++
      const extraction = await extractChunk(chunk, source)
      items = extraction.items
      if (extraction.parseFailed) diagnostics.extractorParseFailed++
      if (extraction.validationFailed) diagnostics.validationFailed++
      if (items.length === 0 && !extraction.parseFailed && !extraction.validationFailed) diagnostics.extractorReturnedEmpty++
    } catch (err) {
      console.error('[extractKnowledge] Chunk extraction failed, skipping', err)
      diagnostics.extractorParseFailed++
      continue
    }

    for (const item of items) {
      try {
        const contentHash = computeContentHash(item.content)
        const hashExists = await prisma.knowledgeItem.findUnique({
          where: { workspaceId_contentHash: { workspaceId, contentHash } },
          select: { id: true },
        })
        if (hashExists) {
          continue
        }

        const embedding = await generateEmbedding(item.content)

        const similar = privacy?.namespace
          ? await searchInNamespace(embedding, privacy.namespace, CONFLICT_TOP_K, 0.75)
          : await searchSimilar(embedding, workspaceId, CONFLICT_TOP_K, 0.75)

        const isDuplicate = similar.some((m) => m.score >= DUPLICATE_THRESHOLD)
        if (isDuplicate) {
          continue
        }

        let frozen = false
        for (const match of similar) {
          const existing = await prisma.knowledgeItem.findFirst({
            where: {
              id: match.id,
              workspaceId,
              ...(privacy?.visibility === 'personal'
                ? { visibility: 'personal', visibilitySetBy: privacy.visibilitySetBy }
                : {}),
            },
            select: { id: true, content: true },
          })
          if (!existing) continue

          const conflict = await checkConflict(item.content, existing.content)
          if (conflict) {
            frozen = true
            await prisma.knowledgeItem.update({
              where: { id: existing.id },
              data: { frozen: true, conflictNote: `Conflicts with: "${item.content}"` },
            })
          }
        }

        // Create DB record first — use the cuid Prisma generates as the canonical ID
        let dbItem: { id: string }
        try {
          dbItem = await prisma.knowledgeItem.create({
            data: {
              workspaceId,
              content: item.content,
              contentHash,
              category: item.category,
              source,
              sourceUrl,
              sourceExternalId,
              notionPageId: notionPage?.id,
              notionPageTitle: notionPage?.title,
              owner: item.owner,
              confidence: item.confidence,
              visibility: privacy?.visibility ?? 'team',
              visibilitySetBy: privacy?.visibilitySetBy ?? null,
              frozen,
              conflictNote: frozen ? 'Conflict detected during extraction' : null,
              sourceCreatedAt: batchSourceCreatedAt,
            },
            select: { id: true },
          })
        } catch (dbErr) {
          console.error('[extractKnowledge] DB write failed, skipping item', dbErr)
          diagnostics.knowledgeItemCreateFailed++
          continue
        }

        // Upsert to Pinecone using the DB cuid so IDs are guaranteed to match
        try {
          const vectorMetadata = { workspaceId, category: item.category, source }
          if (privacy?.namespace) {
            await upsertEmbeddingInNamespace(dbItem.id, embedding, vectorMetadata, privacy.namespace)
          } else {
            await upsertEmbedding(dbItem.id, embedding, vectorMetadata)
          }
          await prisma.knowledgeItem.update({
            where: { id: dbItem.id },
            data: { embeddingId: dbItem.id },
          })
        } catch (pineconeErr) {
          console.error('[extractKnowledge] Pinecone upsert failed, rolling back DB item', pineconeErr)
          diagnostics.embeddingUpsertFailed++
          await prisma.knowledgeItem.delete({ where: { id: dbItem.id } }).catch(() => null)
          continue
        }

        saved.push(item)
      } catch (err) {
        console.error('[extractKnowledge] Item processing failed, skipping', err)
        diagnostics.itemProcessingFailed++
        continue
      }
    }
  }

  return { items: saved, diagnostics }
}
