import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { createHash } from 'node:crypto'
import { parseDocumentAssignment } from '@/lib/documents/assignmentParser'
import type { DocumentResult } from '@/lib/documents/search'

export interface AttachedDocument {
  id: string
  fileName: string
  documentType: string | null
  externalLoadId: string | null
  source: string
  createdAt: Date
  sourceUrl: string | null
  storageUrl: string | null
  extractedText: string | null
  extractionStatus: string | null
}

const ATTACHED_DOCUMENT_SELECT = {
  id: true,
  fileName: true,
  documentType: true,
  externalLoadId: true,
  source: true,
  createdAt: true,
  sourceUrl: true,
  storageUrl: true,
  extractedText: true,
  extractionStatus: true,
} as const

// Bound how much raw document text enters the model context per query.
const MAX_CONTEXT_CHARS_PER_DOCUMENT = 8_000
const KNOWLEDGE_CONTENT_CHARS = 1_500

/** Loads attached documents, enforcing workspace ownership. Returns null when any id is foreign. */
export async function loadWorkspaceDocuments(workspaceId: string, documentIds: string[]): Promise<AttachedDocument[] | null> {
  if (documentIds.length === 0) return []
  const documents = await prisma.documentAttachment.findMany({
    where: { id: { in: documentIds }, workspaceId },
    select: ATTACHED_DOCUMENT_SELECT,
  })
  if (documents.length !== new Set(documentIds).size) return null
  return documents
}

/**
 * Applies "attach this as BOL for load 12345"-style intent from the question to
 * the attached documents, and makes extracted text searchable as KnowledgeItems.
 * Persistence failures are logged, never thrown — the query must still answer.
 */
export async function applyDocumentAssignment(
  workspaceId: string,
  question: string,
  documents: AttachedDocument[],
): Promise<AttachedDocument[]> {
  if (documents.length === 0) return documents
  const assignment = parseDocumentAssignment(question)

  const updated: AttachedDocument[] = []
  for (const document of documents) {
    const nextType = assignment.documentType ?? document.documentType
    const nextLoadId = assignment.externalLoadId ?? document.externalLoadId
    const nextSource = assignment.assignToDatatruck ? 'datatruck' : document.source
    const changed = nextType !== document.documentType || nextLoadId !== document.externalLoadId || nextSource !== document.source

    let result = { ...document, documentType: nextType, externalLoadId: nextLoadId, source: nextSource }
    if (changed) {
      try {
        await prisma.documentAttachment.update({
          where: { id: document.id },
          data: { documentType: nextType, externalLoadId: nextLoadId, source: nextSource },
        })
      } catch (err) {
        console.error('[documents] assignment update failed', err instanceof Error ? err.message : 'unknown error')
        result = document
      }
    }

    await upsertDocumentKnowledge(workspaceId, result).catch((err) =>
      console.error('[documents] knowledge upsert failed', err instanceof Error ? err.message : 'unknown error'))

    updated.push(result)
  }
  return updated
}

/** Creates/refreshes a searchable KnowledgeItem mirroring an uploaded document. */
async function upsertDocumentKnowledge(workspaceId: string, document: AttachedDocument): Promise<void> {
  if (!document.extractedText) return

  const headline = [
    `Uploaded document "${document.fileName}"`,
    document.documentType ? `type: ${document.documentType}` : null,
    document.externalLoadId ? `load: ${document.externalLoadId}` : null,
  ].filter(Boolean).join(' — ')
  const content = `${headline}\n${document.extractedText.slice(0, KNOWLEDGE_CONTENT_CHARS)}`
  const sourceExternalId = `document:${document.id}`
  const contentHash = createHash('sha256').update(`${sourceExternalId}\n${content}`).digest('hex')
  const source = document.source === 'datatruck' ? 'datatruck' : 'manual_upload'
  const sourceMetadata = {
    documentId: document.id,
    fileName: document.fileName,
    documentType: document.documentType,
    externalLoadId: document.externalLoadId,
    source: 'manual_upload',
    ...(document.source === 'datatruck' ? { assignedTo: 'datatruck' } : {}),
  }

  const existing = await prisma.knowledgeItem.findFirst({
    where: { workspaceId, sourceExternalId },
    select: { id: true, contentHash: true },
  })

  if (existing) {
    if (existing.contentHash !== contentHash) {
      await prisma.knowledgeItem.update({
        where: { id: existing.id },
        data: { content, contentHash, source, sourceMetadata, sourceUrl: document.storageUrl },
      })
    }
    return
  }

  const item = await prisma.knowledgeItem.create({
    data: {
      workspaceId,
      content,
      contentHash,
      category: 'reference',
      source,
      sourceExternalId,
      sourceUrl: document.storageUrl,
      sourceMetadata,
      visibility: 'team',
      confidence: 0.9,
    },
    select: { id: true },
  })

  try {
    const embedding = await generateEmbedding(content)
    await upsertEmbedding(item.id, embedding, { workspaceId, category: 'reference', source })
    await prisma.knowledgeItem.update({ where: { id: item.id }, data: { embeddingId: item.id } })
  } catch {
    // Item remains findable via keyword fallback without a vector.
  }
}

/** Full-text context block for documents explicitly attached to this question. */
export function attachedDocumentContext(documents: AttachedDocument[]): string {
  return documents.map((document) => {
    const header = [
      `File: ${document.fileName}`,
      document.documentType ? `Type: ${document.documentType}` : null,
      document.externalLoadId ? `Load: ${document.externalLoadId}` : null,
      `Extraction: ${document.extractionStatus ?? 'unknown'}`,
    ].filter(Boolean).join(' · ')
    const body = document.extractedText
      ? document.extractedText.slice(0, MAX_CONTEXT_CHARS_PER_DOCUMENT)
      : '(No readable text could be extracted from this file — it may be scanned or an unsupported format.)'
    return `[Attached document] ${header}\n${body}`
  }).join('\n\n')
}

export function toDocumentResults(documents: AttachedDocument[]): DocumentResult[] {
  return documents.map((document) => ({
    id: document.id,
    fileName: document.fileName,
    documentType: document.documentType,
    externalLoadId: document.externalLoadId,
    source: document.source,
    createdAt: document.createdAt.toISOString(),
    sourceUrl: document.sourceUrl,
    storageUrl: document.storageUrl,
    snippet: document.extractedText ? `${document.extractedText.slice(0, 240)}...` : null,
  }))
}
