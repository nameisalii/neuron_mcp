import { getAppUrl } from '@/lib/app-url'

export const DEFAULT_GMAIL_LABELS = ['INBOX', 'SENT'] as const
export const DEFAULT_GMAIL_LABEL_NAMES = ['Inbox', 'Sent'] as const
export const GOOGLE_SIGNIN_IDENTITY_SCOPES = ['openid', 'email', 'profile'] as const
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'] as const

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
  const value = pickEnv('GMAIL_CLIENT_ID', 'GOOGLE_CLIENT_ID')
  if (!value) throw new Error('GMAIL_CLIENT_ID is not configured')
  return value
}

export function getGmailClientSecret(): string {
  const value = pickEnv('GMAIL_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET')
  if (!value) throw new Error('GMAIL_CLIENT_SECRET is not configured')
  return value
}

export function getGmailScopes(): string {
  return GMAIL_SCOPES.join(' ')
}

export function getGmailRedirectUri(): string {
  return pickEnv('GMAIL_REDIRECT_URI') ?? `${getGmailAppUrl()}/api/integrations/gmail/callback`
}

export function safeGoogleOAuthDebug(details: { flow: 'google_signin' | 'gmail'; clientId?: string | null; redirectUri: string; scopes: readonly string[] }): void {
  if (process.env.NODE_ENV === 'production' || process.env.GOOGLE_OAUTH_DEBUG_SAFE !== 'true') return
  console.info('[google/oauth-safe]', { flow: details.flow, clientIdPrefix: details.clientId?.slice(0, 8) || null, redirectUri: details.redirectUri, scopes: [...details.scopes] })
}

export function getGmailNamespace(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`
}
