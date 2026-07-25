import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { extractDocumentText } from '@/lib/documents/extractText'
import { deleteDocumentFile, sanitizeFileName, saveUploadedDocument } from '@/lib/storage/documents'
import { safelySuggestTasksFromKnowledgeItem } from '@/lib/tasks/service'

const EXTRACTED_SNIPPET_CHARS = 1_500

export interface ManualKnowledgeFile {
  fileName: string
  mimeType: string | null
  fileSize: number
  buffer: Buffer
}

export interface ManualKnowledgeParams {
  workspaceId: string
  source: string
  title: string
  description: string
  category: string
  createdByUserId: string
  createdByName: string
  externalLoadId?: string | null
  documentType?: string | null
  /** Datatruck module this entry belongs to (e.g. "invoices") for file-import coverage. */
  moduleKey?: string | null
  file?: ManualKnowledgeFile | null
}

export interface ManualKnowledgeResult {
  knowledgeItem: {
    id: string
    content: string
    category: string
    source: string
    sourceExternalId: string
    createdAt: string
  }
  documentAttachment: {
    id: string
    fileName: string
    documentType: string | null
    externalLoadId: string | null
    extractionStatus: string | null
    storageUrl: string | null
    createdAt: string
  } | null
}

/**
 * Creates a user-authored KnowledgeItem under an integration source, with an
 * optional access-controlled file. Extraction and embedding are best-effort:
 * a broken file or missing vector never blocks the knowledge item.
 */
export async function createManualKnowledgeItemWithOptionalDocument(
  params: ManualKnowledgeParams,
): Promise<ManualKnowledgeResult> {
  const { workspaceId, source, title, description, category } = params

  let documentAttachment: ManualKnowledgeResult['documentAttachment'] = null
  let extractedText: string | null = null

  if (params.file) {
    const stored = await storeManualDocument(params, params.file)
    documentAttachment = stored.attachment
    extractedText = stored.extractedText
  }

  const content = [
    title.trim(),
    description.trim(),
    extractedText ? `Attached document text:\n${extractedText.slice(0, EXTRACTED_SNIPPET_CHARS)}` : null,
  ].filter(Boolean).join('\n\n')

  const sourceExternalId = `manual:${source}:${randomUUID()}`
  const contentHash = createHash('sha256').update(`${sourceExternalId}\n${content}`).digest('hex')
  const sourceMetadata = {
    manual: true,
    title: title.trim(),
    label: category,
    integration: source,
    createdByUserId: params.createdByUserId,
    createdByName: params.createdByName,
    ...(params.externalLoadId ? { externalLoadId: params.externalLoadId } : {}),
    ...(params.documentType ? { documentType: params.documentType } : {}),
    ...(params.moduleKey ? { moduleKey: params.moduleKey, importMethod: 'file_import' } : {}),
    ...(documentAttachment ? { documentId: documentAttachment.id } : {}),
  }

  const item = await prisma.knowledgeItem.create({
    data: {
      workspaceId,
      content,
      contentHash,
      category,
      source,
      sourceExternalId,
      sourceUrl: documentAttachment?.storageUrl ?? null,
      sourceMetadata,
      owner: params.createdByName,
      // Manual entries are user-verified by definition.
      verified: true,
      verifiedAt: new Date(),
      verifiedBy: params.createdByUserId,
      visibility: 'team',
      confidence: 1,
    },
    select: { id: true, content: true, category: true, source: true, sourceExternalId: true, createdAt: true },
  })

  await safelySuggestTasksFromKnowledgeItem({
    id: item.id,
    workspaceId,
    content,
    source,
    sourceExternalId,
    sourceUrl: documentAttachment?.storageUrl ?? null,
    sourceTitle: title.trim() || 'Manual knowledge',
  })

  try {
    const embedding = await generateEmbedding(content)
    await upsertEmbedding(item.id, embedding, { workspaceId, category, source })
    await prisma.knowledgeItem.update({ where: { id: item.id }, data: { embeddingId: item.id } })
  } catch {
    // Keyword fallback still finds the item without a vector.
  }

  return {
    knowledgeItem: {
      ...item,
      sourceExternalId: item.sourceExternalId ?? sourceExternalId,
      createdAt: item.createdAt.toISOString(),
    },
    documentAttachment,
  }
}

async function storeManualDocument(
  params: ManualKnowledgeParams,
  file: ManualKnowledgeFile,
): Promise<{ attachment: ManualKnowledgeResult['documentAttachment']; extractedText: string | null }> {
  const extraction = await extractDocumentText({
    buffer: file.buffer,
    fileName: file.fileName,
    mimeType: file.mimeType,
  })

  const safeName = sanitizeFileName(file.fileName)
  const document = await prisma.documentAttachment.create({
    data: {
      workspaceId: params.workspaceId,
      fileName: safeName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      source: params.source,
      sourceExternalId: `manual:${params.source}:document:${randomUUID()}`,
      documentType: params.documentType ?? null,
      externalLoadId: params.externalLoadId ?? null,
      extractedText: extraction.text,
      extractionStatus: extraction.status,
      uploadedByUserId: params.createdByUserId,
      uploadedByName: params.createdByName,
    },
    select: { id: true, fileName: true, documentType: true, externalLoadId: true, extractionStatus: true, createdAt: true },
  })

  try {
    const { storageKey } = await saveUploadedDocument({
      workspaceId: params.workspaceId,
      documentId: document.id,
      fileName: safeName,
      buffer: file.buffer,
    })
    const storageUrl = `/api/documents/${document.id}`
    await prisma.documentAttachment.update({ where: { id: document.id }, data: { storageKey, storageUrl } })
    return {
      attachment: { ...document, storageUrl, createdAt: document.createdAt.toISOString() },
      extractedText: extraction.text,
    }
  } catch (err) {
    // Never keep metadata for a file that was not stored — but the knowledge
    // item itself still gets created by the caller.
    await prisma.documentAttachment.delete({ where: { id: document.id } }).catch(() => null)
    await deleteDocumentFile(`${params.workspaceId}/${document.id}/${safeName}`).catch(() => null)
    console.error('[knowledge/manual] document storage failed', err instanceof Error ? err.message : 'unknown error')
    return { attachment: null, extractedText: null }
  }
}
