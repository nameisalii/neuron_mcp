import { getAppUrl } from '@/lib/app-url'

export const DEFAULT_GMAIL_LABELS = ['INBOX', 'SENT'] as const
export const DEFAULT_GMAIL_LABEL_NAMES = ['Inbox', 'Sent'] as const

export function getGmailAppUrl(): string {
  return getAppUrl()
}

function pickEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}

export function getGmailClientId(): string {
  const value = pickEnv('GOOGLE_CLIENT_ID', 'GMAIL_CLIENT_ID')
  if (!value) throw new Error('GOOGLE_CLIENT_ID is not configured')
  return value
}

export function getGmailClientSecret(): string {
  const value = pickEnv('GOOGLE_CLIENT_SECRET', 'GMAIL_CLIENT_SECRET')
  if (!value) throw new Error('GOOGLE_CLIENT_SECRET is not configured')
  return value
}

export function getGmailScopes(): string {
  return ['https://www.googleapis.com/auth/gmail.readonly'].join(' ')
}

export function getGmailRedirectUri(): string {
  return `${getGmailAppUrl()}/api/integrations/gmail/callback`
}

export function getGmailNamespace(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`
}
