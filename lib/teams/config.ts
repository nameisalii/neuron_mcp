const DEFAULT_TENANT_ID = 'common'
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/api/integrations/teams/callback'

function trim(value: string | undefined): string | null {
  const result = value?.trim()
  return result ? result : null
}

export const TEAMS_SCOPES = [
  'offline_access',
  'User.Read',
  'Team.ReadBasic.All',
  'Channel.ReadBasic.All',
  'ChannelMessage.Read.All',
]

export function getTeamsConfig() {
  return {
    clientId: trim(process.env.MICROSOFT_CLIENT_ID),
    clientSecret: trim(process.env.MICROSOFT_CLIENT_SECRET),
    tenantId: trim(process.env.MICROSOFT_TENANT_ID) ?? DEFAULT_TENANT_ID,
    redirectUri: trim(process.env.MICROSOFT_REDIRECT_URI) ?? DEFAULT_REDIRECT_URI,
    webhookClientState: trim(process.env.MICROSOFT_TEAMS_WEBHOOK_CLIENT_STATE),
  }
}

export function isTeamsOAuthConfigured(): boolean {
  const config = getTeamsConfig()
  return Boolean(config.clientId && config.clientSecret && config.redirectUri)
}

export function getTeamsAuthorizeUrl(state: string): string | null {
  const config = getTeamsConfig()
  if (!config.clientId || !config.redirectUri) return null

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: TEAMS_SCOPES.join(' '),
    state,
    prompt: 'select_account',
  })

  return `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize?${params}`
}
