import { extractRelatedLoadId } from '@/lib/chat/persistence'
import { extractDocumentType } from '@/lib/documents/search'

export interface DocumentAssignment {
  documentType: string | null
  externalLoadId: string | null
  assignToDatatruck: boolean
}

// extractRelatedLoadId covers "load/order/shipment 12345"; this adds the
// "trip 12345" / "ID 12345" phrasings without touching chat persistence.
const EXTRA_LOAD_ID_PATTERN = /\b(?:trip|id)\s*[:#-]?\s*([a-z0-9][a-z0-9-]{2,})\b/i

const DATATRUCK_CONTEXT_PATTERN = /\b(datatruck|logistics|dispatch(?:er)?|truck(?:ing)?)\b/i

/**
 * Reads an accompanying chat message for document intent: what kind of
 * document it is, which load it belongs to, and whether the user wants it
 * filed under the Datatruck/logistics context.
 */
export function parseDocumentAssignment(message: string): DocumentAssignment {
  const text = message.trim()
  if (!text) return { documentType: null, externalLoadId: null, assignToDatatruck: false }

  const documentType = extractDocumentType(text)
  const externalLoadId = extractRelatedLoadId(text) ?? text.match(EXTRA_LOAD_ID_PATTERN)?.[1] ?? null
  // A load-bound document is logistics context even without the word "Datatruck".
  const assignToDatatruck = DATATRUCK_CONTEXT_PATTERN.test(text) || Boolean(externalLoadId && documentType)

  return { documentType, externalLoadId, assignToDatatruck }
}
