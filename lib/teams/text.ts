const SMALL_TALK = new Set([
  'hi',
  'hey',
  'hello',
  'yo',
  'gm',
  'gn',
  'ok',
  'okay',
  'k',
  'yes',
  'no',
  'thanks',
  'thank you',
  'how are you',
  'how are you doing',
  "what's up",
  'whats up',
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
  'decide',
  'decided',
  'decision',
  'rule',
  'process',
  'owner',
  'deadline',
  'customer',
  'pricing',
  'invoice',
  'bug',
  'auth',
  'onboarding',
  'integration',
  'api',
  'contract',
  'meeting',
  'follow-up',
  'followup',
  'todo',
  'task',
  'due',
  'blocked',
  'approved',
  'reject',
  'refund',
  'churn',
])

export type TeamsTextSkipReason =
  | 'empty_text'
  | 'too_short'
  | 'small_talk'
  | 'emoji_only'
  | 'punctuation_only'
  | 'url_only'

export function normalizeTeamsText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function stripTeamsHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

export function teamsMessageText(content: string | null | undefined, contentType?: string): string {
  const raw = content ?? ''
  return normalizeTeamsText(contentType?.toLowerCase() === 'html' ? stripTeamsHtml(raw) : raw)
}

export function shouldSkipTeamsText(text: string): { skip: boolean; reason?: TeamsTextSkipReason } {
  const normalized = normalizeTeamsText(text)
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
