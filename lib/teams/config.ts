const DEFAULT_TENANT_ID = 'common'
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/api/integrations/teams/callback'

function trim(value: string | undefined): string | null {
  const result = value?.trim()
  return result ? result : null
}

export const MICROSOFT_BASIC_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
] as const

export const TEAMS_SYNC_SCOPES = [
  'Team.ReadBasic.All',
  'Channel.ReadBasic.All',
  'ChannelMessage.Read.All',
] as const

export const TEAMS_SCOPES = [...MICROSOFT_BASIC_SCOPES, ...TEAMS_SYNC_SCOPES]
export type MicrosoftConnectionLevel = 'basic' | 'teams'

export const TEAMS_ADMIN_INSTRUCTIONS = 'Please approve the Neuron enterprise application in Microsoft Entra ID and grant consent for the Microsoft Graph permissions required for Teams sync, including ChannelMessage.Read.All, Team.ReadBasic.All, and Channel.ReadBasic.All.'

export const TEAMS_SCOPE_NOTES: Record<string, string> = {
  offline_access: 'Keep the Teams connection available for future syncs.',
  'User.Read': 'Identify the signed-in Microsoft account.',
  'Team.ReadBasic.All': 'List Teams the signed-in user can access.',
  'Channel.ReadBasic.All': 'List channels in accessible Teams.',
  'ChannelMessage.Read.All': 'Read recent channel messages for ingestion.',
}

export function isTeamsAdminConsentError(error: string | null | undefined, description?: string | null): boolean {
  const text = `${error ?? ''} ${description ?? ''}`.toLowerCase()
  return (
    text.includes('admin_consent_required') ||
    text.includes('aadsts65001') ||
    text.includes('aadsts90094') ||
    text.includes('consent_required') ||
    text.includes('interaction_required') ||
    text.includes('access_denied') ||
    text.includes('administrator approval required')
  )
}

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

export function getTeamsAuthorizeUrl(state: string, level: MicrosoftConnectionLevel = 'basic'): string | null {
  const config = getTeamsConfig()
  if (!config.clientId || !config.redirectUri) return null

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: (level === 'teams' ? TEAMS_SCOPES : MICROSOFT_BASIC_SCOPES).join(' '),
    state,
    prompt: 'select_account',
  })

  return `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize?${params}`
}
