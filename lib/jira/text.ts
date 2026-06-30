const SMALL_TALK = new Set([
  'hi',
  'hey',
  'hello',
  'yo',
  'ok',
  'okay',
  'k',
  'thanks',
  'thank you',
  'done',
  'how are you',
  'how are you doing',
  'lol',
  'haha',
])

const ACTION_WORDS = new Set([
  'ship',
  'launch',
  'fix',
  'build',
  'deploy',
  'release',
  'blocker',
  'blocked',
  'customer',
  'churn',
  'risk',
  'billing',
  'auth',
  'stripe',
  'bug',
  'decision',
  'deadline',
  'owner',
  'approved',
  'reject',
  'refund',
])

export type JiraTextSkipReason =
  | 'empty_text'
  | 'too_short'
  | 'small_talk'
  | 'emoji_only'
  | 'punctuation_only'
  | 'url_only'

export function normalizeJiraText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function shouldSkipJiraText(text: string): { skip: boolean; reason?: JiraTextSkipReason } {
  const normalized = normalizeJiraText(text)
  if (!normalized) return { skip: true, reason: 'empty_text' }

  const smallTalkCandidate = normalized.toLocaleLowerCase().replace(/[.!?,;:]+$/g, '').trim()
  if (SMALL_TALK.has(smallTalkCandidate)) return { skip: true, reason: 'small_talk' }

  if (/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\u200D\uFE0F\u{1F3FB}-\u{1F3FF}\s]+$/u.test(normalized)) {
    return { skip: true, reason: 'emoji_only' }
  }
  if (/^[\p{P}\s]+$/u.test(normalized)) return { skip: true, reason: 'punctuation_only' }
  if (/^(?:https?:\/\/|www\.)\S+$/iu.test(normalized)) return { skip: true, reason: 'url_only' }

  const words = normalized.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []
  if (words.length <= 1) return { skip: true, reason: 'too_short' }

  const hasActionWord = words.some((word) => ACTION_WORDS.has(word.toLocaleLowerCase()))
  if (normalized.length < 8 && !hasActionWord) return { skip: true, reason: 'too_short' }

  return { skip: false }
}

export function adfToPlainText(node: unknown): string {
  const parts: string[] = []

  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return
    const current = value as Record<string, unknown>
    if (typeof current.text === 'string') parts.push(current.text)
    if (current.type === 'hardBreak') parts.push('\n')
    if (Array.isArray(current.content)) {
      for (const child of current.content) visit(child)
      if (['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'].includes(String(current.type))) {
        parts.push('\n')
      }
    }
  }

  if (typeof node === 'string') return normalizeJiraText(node)
  visit(node)
  return normalizeJiraText(parts.join(' '))
}
