import { z } from 'zod'
import { openai, generateEmbedding } from '@/lib/openai'
import { prisma } from '@/lib/db'
import { upsertEmbedding, searchSimilar, deleteEmbedding } from '@/lib/pinecone'
import { EXTRACTION_SYSTEM_PROMPT, CONFLICT_SYSTEM_PROMPT } from './prompts'
import type { SlackMessage, ExtractedItem } from '@/types'

const CHUNK_SIZE = 20
const CONFIDENCE_THRESHOLD = 0.4
const CONFLICT_TOP_K = 3
const DUPLICATE_THRESHOLD = 0.95

const extractedItemSchema = z.object({
  content: z.string().min(1),
  category: z.enum(['rule', 'decision', 'process', 'idea', 'fact']),
  owner: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

function computeContentHash(content: string): string {
  return content.slice(0, 100).toLowerCase().replace(/\s+/g, ' ').trim()
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatMessages(messages: SlackMessage[]): string {
  return messages
    .map((m) => `${escapeXml(m.user)} (${escapeXml(m.channel)}): ${escapeXml(m.text.slice(0, 500))}`)
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

async function extractChunk(messages: SlackMessage[]): Promise<ExtractedItem[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: `<messages>\n${formatMessages(messages)}\n</messages>` },
    ],
    temperature: 0.1,
    max_tokens: 1000,
  })
  const raw = response.choices[0]?.message?.content ?? '[]'
  try {
    const validated = z.array(extractedItemSchema).parse(JSON.parse(raw))
    return validated.filter((item) => item.confidence >= CONFIDENCE_THRESHOLD) as ExtractedItem[]
  } catch (err) {
    console.error('[extractChunk] Failed to parse or validate LLM output', err)
    return []
  }
}

export async function extractKnowledge(
  messages: SlackMessage[],
  workspaceId: string,
  source = 'slack',
  sourceUrl?: string,
): Promise<ExtractedItem[]> {
  const saved: ExtractedItem[] = []

  const chunks: SlackMessage[][] = []
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + CHUNK_SIZE))
  }

  for (const chunk of chunks) {
    let items: ExtractedItem[]
    try {
      items = await extractChunk(chunk)
    } catch (err) {
      console.error('[extractKnowledge] Chunk extraction failed, skipping', err)
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

        const similar = await searchSimilar(embedding, workspaceId, CONFLICT_TOP_K, 0.75)

        const isDuplicate = similar.some((m) => m.score >= DUPLICATE_THRESHOLD)
        if (isDuplicate) {
          continue
        }

        let frozen = false
        for (const match of similar) {
          const existing = await prisma.knowledgeItem.findFirst({
            where: { id: match.id, workspaceId },
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
              owner: item.owner,
              confidence: item.confidence,
              frozen,
              conflictNote: frozen ? 'Conflict detected during extraction' : null,
            },
            select: { id: true },
          })
        } catch (dbErr) {
          console.error('[extractKnowledge] DB write failed, skipping item', dbErr)
          continue
        }

        // Upsert to Pinecone using the DB cuid so IDs are guaranteed to match
        try {
          await upsertEmbedding(dbItem.id, embedding, {
            workspaceId,
            category: item.category,
            source,
          })
          await prisma.knowledgeItem.update({
            where: { id: dbItem.id },
            data: { embeddingId: dbItem.id },
          })
        } catch (pineconeErr) {
          console.error('[extractKnowledge] Pinecone upsert failed, rolling back DB item', pineconeErr)
          await prisma.knowledgeItem.delete({ where: { id: dbItem.id } }).catch(() => null)
          continue
        }

        saved.push(item)
      } catch (err) {
        console.error('[extractKnowledge] Item processing failed, skipping', err)
        continue
      }
    }
  }

  return saved
}
