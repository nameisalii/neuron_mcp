import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding, upsertEmbeddingInNamespace } from '@/lib/pinecone'
import type { KnowledgeItemLike, ResolvedLinkResult } from './resolveLinks'

type ParentForLinkedKnowledge = KnowledgeItemLike & {
  verified?: boolean
  owner?: string | null
  sourceCreatedAt?: Date | null
}

function safeLinkedFrom(metadata: unknown): Record<string, string> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const record = metadata as Record<string, unknown>
  const allowed = [
    'channelName',
    'channel',
    'chatTitle',
    'groupName',
    'authorName',
    'username',
    'senderName',
    'fromDisplayName',
    'messageDate',
  ]
  return Object.fromEntries(allowed.flatMap((key) => (
    typeof record[key] === 'string' && record[key].trim() ? [[key, record[key].trim()]] : []
  )))
}

function linkedContentHash(workspaceId: string, parentId: string, normalizedUrl: string): string {
  return createHash('sha256').update(`linked:${workspaceId}:${parentId}:${normalizedUrl}`).digest('hex')
}

export async function createLinkedKnowledge(input: {
  parent: ParentForLinkedKnowledge
  resolved: ResolvedLinkResult[]
}): Promise<Array<{ id: string; created: boolean }>> {
  const output: Array<{ id: string; created: boolean }> = []
  for (const link of input.resolved) {
    if (!['success', 'cache_hit', 'too_large'].includes(link.status) || !link.markdown) continue
    if (
      link.parentKnowledgeItemId !== input.parent.id ||
      link.metadata.parentWorkspaceId !== input.parent.workspaceId ||
      link.visibility !== input.parent.visibility ||
      (link.visibilitySetBy ?? null) !== (input.parent.visibilitySetBy ?? null)
    ) {
      throw new Error('LINK_SCOPE_MISMATCH')
    }

    const contentHash = linkedContentHash(input.parent.workspaceId, input.parent.id, link.normalizedUrl)
    const existing = await prisma.knowledgeItem.findUnique({
      where: {
        workspaceId_contentHash: {
          workspaceId: input.parent.workspaceId,
          contentHash,
        },
      },
      select: { id: true },
    })
    if (existing) {
      output.push({ id: existing.id, created: false })
      continue
    }

    const hostname = new URL(link.sourceUrl).hostname
    const linkedFrom = safeLinkedFrom(input.parent.sourceMetadata)
    const created = await prisma.knowledgeItem.create({
      data: {
        workspaceId: input.parent.workspaceId,
        title: link.title ?? hostname,
        content: link.markdown,
        summary: link.markdown.slice(0, 500),
        category: 'reference',
        aiSuggestedCategory: 'reference',
        source: 'linked_page',
        sourceUrl: link.sourceUrl,
        sourceExternalId: link.normalizedUrl,
        sourceMetadata: {
          sourceUrl: link.sourceUrl,
          normalizedUrl: link.normalizedUrl,
          fetchedAt: link.fetchedAt?.toISOString() ?? null,
          parentKnowledgeItemId: input.parent.id,
          parentWorkspaceId: input.parent.workspaceId,
          parentSource: input.parent.source,
          parentSourceExternalId: input.parent.sourceExternalId ?? null,
          linkedFrom,
          cacheHit: link.metadata.cacheHit,
        } satisfies Prisma.InputJsonValue,
        owner: input.parent.owner ?? null,
        verified: input.parent.verified ?? false,
        confidence: 0.8,
        contentHash,
        label: link.title ?? hostname,
        visibility: input.parent.visibility,
        visibilitySetBy: input.parent.visibilitySetBy ?? null,
        sourceCreatedAt: input.parent.sourceCreatedAt ?? null,
      },
      select: { id: true },
    })

    try {
      const embedding = await generateEmbedding(link.markdown)
      if (input.parent.visibility === 'personal' && input.parent.visibilitySetBy) {
        await upsertEmbeddingInNamespace(
          created.id,
          embedding,
          { workspaceId: input.parent.workspaceId, category: 'reference', source: 'linked_page' },
          `${input.parent.workspaceId}:${input.parent.visibilitySetBy}`,
        )
      } else {
        await upsertEmbedding(created.id, embedding, {
          workspaceId: input.parent.workspaceId,
          category: 'reference',
          source: 'linked_page',
        })
      }
      await prisma.knowledgeItem.update({ where: { id: created.id }, data: { embeddingId: created.id } })
    } catch {
      console.error('[link-enrichment] embedding unavailable', { errorCode: 'LINK_EMBEDDING_FAILED' })
    }
    output.push({ id: created.id, created: true })
  }
  return output
}
