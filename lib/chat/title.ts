function extractLoadId(text: string): string | null {
  const match = text.match(/\b(?:load|lo|order|shipment)\s*(?:id|#|number|no\.?)?\s*[:#-]?\s*([a-z0-9][a-z0-9-]{2,})\b/i)
    ?? text.match(/\b([0-9]{4,})\b/)
  return match?.[1] ?? null
}

export function generateConversationTitle(question: string): string {
  const compact = question.trim().replace(/\s+/g, ' ')
  if (!compact) return 'New conversation'

  const loadId = extractLoadId(compact)
  if (loadId) {
    if (/\bbol\b|bill of lading/i.test(compact)) return `BOL for Load ${loadId}`
    if (/\bpod\b|proof of delivery/i.test(compact)) return `POD for Load ${loadId}`
    if (/\brate\s*confirmation\b|\bratecon\b|\brate con\b/i.test(compact)) return `Rate Confirmation for Load ${loadId}`
    if (/\binvoice\b/i.test(compact)) return `Invoice for Load ${loadId}`
    return `Load ${loadId}`
  }

  if (/\bcta\b/i.test(compact) && /public website/i.test(compact)) return 'CTA and public website'
  if (/\bdatatruck\b/i.test(compact)) return 'Datatruck'

  return compact.length > 60 ? compact.slice(0, 60) : compact
}
