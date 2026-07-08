export type NeuronCommandIntent = 'attach_document' | 'label_document' | 'find_document' | 'remember_fact'
export type NeuronDocumentType = 'BOL' | 'POD' | 'RATE_CONFIRMATION' | 'INVOICE' | 'LUMPER_RECEIPT' | 'OTHER'

export interface ParsedNeuronCommand {
  intent: NeuronCommandIntent
  documentType: NeuronDocumentType
  externalLoadId: string | null
  source: string | null
}

const DOCUMENT_TYPES: Array<[NeuronDocumentType, RegExp]> = [
  ['BOL', /\bbol\b|bill of lading/i],
  ['POD', /\bpod\b|proof of delivery/i],
  ['RATE_CONFIRMATION', /rate confirmation|rate con/i],
  ['INVOICE', /\binvoice\b/i],
  ['LUMPER_RECEIPT', /lumper/i],
]

export function parseNeuronCommand(input: string, source: string | null = null): ParsedNeuronCommand | null {
  const text = input.trim()
  if (!/@?neuron\b/i.test(text)) return null

  const normalized = text.replace(/^@?neuron[:,]?\s*/i, '')
  const documentType = DOCUMENT_TYPES.find(([, pattern]) => pattern.test(normalized))?.[0] ?? 'OTHER'
  const loadMatch = normalized.match(/\b(?:load|lo)\s*(?:id|#|number|no\.?)?\s*[:#-]?\s*([a-z0-9][a-z0-9-]{2,})\b/i)

  let intent: NeuronCommandIntent = 'remember_fact'
  if (/\bfind|show|where|get\b/i.test(normalized) && /\b(document|file|bol|pod|invoice|receipt|rate)\b/i.test(normalized)) {
    intent = 'find_document'
  } else if (/\battach|upload|save\b/i.test(normalized) && /\b(document|file|pdf|bol|pod|invoice|receipt|rate|this)\b/i.test(normalized)) {
    intent = 'attach_document'
  } else if (/\blabel|tag|mark\b/i.test(normalized) && /\b(document|file|pdf|this)\b/i.test(normalized)) {
    intent = 'label_document'
  }

  return {
    intent,
    documentType,
    externalLoadId: loadMatch?.[1] ?? null,
    source,
  }
}
