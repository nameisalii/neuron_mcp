import { prisma } from '@/lib/db'
import { extractRelatedLoadId } from '@/lib/chat/persistence'

export interface DocumentResult {
  id: string
  fileName: string
  documentType: string | null
  externalLoadId: string | null
  source: string
  createdAt: string
  sourceUrl: string | null
  storageUrl: string | null
  snippet: string | null
}

const DOCUMENT_TYPE_TERMS = [
  ['BOL', /\bbol\b|bill of lading/i],
  ['POD', /\bpod\b|proof of delivery/i],
  ['RATE_CONFIRMATION', /rate confirmation|rate con/i],
  ['INVOICE', /\binvoice\b/i],
  ['LUMPER_RECEIPT', /lumper/i],
] as const

export function extractDocumentType(text: string): string | null {
  return DOCUMENT_TYPE_TERMS.find(([, pattern]) => pattern.test(text))?.[0] ?? null
}

function snippet(text: string | null | undefined, query: string): string | null {
  if (!text) return null
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 240) return normalized
  const firstTerm = query.trim().split(/\s+/).find((term) => term.length > 2)
  const index = firstTerm ? normalized.toLowerCase().indexOf(firstTerm.toLowerCase()) : -1
  const start = Math.max(0, index > -1 ? index - 80 : 0)
  return `${start > 0 ? '...' : ''}${normalized.slice(start, start + 240)}...`
}

export async function searchDocumentAttachments(workspaceId: string, query: string): Promise<DocumentResult[]> {
  const relatedLoadId = extractRelatedLoadId(query)
  const documentType = extractDocumentType(query)
  const terms = query.trim().split(/\s+/).filter((term) => term.length > 2).slice(0, 6)
  const textFilters = terms.flatMap((term) => [
    { fileName: { contains: term, mode: 'insensitive' as const } },
    { extractedText: { contains: term, mode: 'insensitive' as const } },
  ])

  const documents = await prisma.documentAttachment.findMany({
    where: {
      workspaceId,
      AND: [
        relatedLoadId ? { externalLoadId: relatedLoadId } : {},
        documentType ? { documentType } : {},
        textFilters.length ? { OR: textFilters } : {},
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      fileName: true,
      documentType: true,
      externalLoadId: true,
      source: true,
      createdAt: true,
      sourceUrl: true,
      storageUrl: true,
      extractedText: true,
    },
  })

  return documents.map((document) => ({
    id: document.id,
    fileName: document.fileName,
    documentType: document.documentType,
    externalLoadId: document.externalLoadId,
    source: document.source,
    createdAt: document.createdAt.toISOString(),
    sourceUrl: document.sourceUrl,
    storageUrl: document.storageUrl,
    snippet: snippet(document.extractedText, query),
  }))
}
