const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi
const TRAILING_PUNCTUATION = /[),.;:!?}]+$/

function removeTrailingPunctuation(value: string): string {
  let cleaned = value.trim().replace(TRAILING_PUNCTUATION, '')
  if (cleaned.endsWith(']')) {
    const openingBrackets = (cleaned.match(/\[/g) ?? []).length
    const closingBrackets = (cleaned.match(/\]/g) ?? []).length
    if (closingBrackets > openingBrackets) cleaned = cleaned.slice(0, -1)
  }
  return cleaned
}

export function normalizeUrl(value: string): string {
  const parsed = new URL(removeTrailingPunctuation(value))
  parsed.hostname = parsed.hostname.toLowerCase()
  parsed.hash = ''
  if (parsed.pathname === '') parsed.pathname = '/'
  return parsed.toString()
}

export function dedupeUrls(urls: string[]): string[] {
  const unique = new Map<string, string>()
  for (const value of urls) {
    try {
      const normalized = normalizeUrl(value)
      if (!unique.has(normalized)) unique.set(normalized, normalized)
    } catch {
      // Invalid and unsupported URLs are deliberately ignored.
    }
  }
  return [...unique.values()]
}

export function extractUrls(text: string): string[] {
  if (!text) return []
  return dedupeUrls(text.match(URL_PATTERN) ?? [])
}
