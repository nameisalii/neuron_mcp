import { getAppUrl } from '@/lib/app-url'

export function getNotionAppUrl(): string {
  return getAppUrl()
}

export function getNotionRedirectUri(): string {
  const configured = process.env.NOTION_REDIRECT_URI?.trim()
  if (configured) return configured
  return `${getNotionAppUrl()}/api/integrations/notion/callback`
}

export function getNotionOAuthMismatchMessage(
  redirectUri = getNotionRedirectUri(),
): string {
  return 'Notion connection failed because the OAuth client or redirect URL does not match. '
    + 'Check that the same Notion app credentials are used in .env.local/Vercel and that '
    + `this redirect URL is added in Notion: ${redirectUri}`
}

export function isNotionOAuthConfigured(): boolean {
  return Boolean(
    process.env.NOTION_CLIENT_ID?.trim()
    && process.env.NOTION_CLIENT_SECRET?.trim(),
  )
}

export function getNotionClientId(): string {
  const value = process.env.NOTION_CLIENT_ID?.trim()
  if (!value) throw new Error('NOTION_CLIENT_ID is not configured')
  return value
}

export function getNotionClientSecret(): string {
  const value = process.env.NOTION_CLIENT_SECRET?.trim()
  if (!value) throw new Error('NOTION_CLIENT_SECRET is not configured')
  return value
}

export function getNotionClientIdPrefix(): string {
  return process.env.NOTION_CLIENT_ID?.trim().slice(0, 6) || 'unset'
}
