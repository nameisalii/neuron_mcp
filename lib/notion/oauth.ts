const LOCAL_APP_URL = 'http://localhost:3000'
const PRODUCTION_APP_URL = 'https://app.tryneuron.net'

export function getNotionAppUrl(): string {
  if (process.env.NODE_ENV !== 'production') return LOCAL_APP_URL
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || PRODUCTION_APP_URL
}

export function getNotionRedirectUri(): string {
  return `${getNotionAppUrl()}/api/integrations/notion/callback`
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
