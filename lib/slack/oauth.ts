export type SlackConnectionMode = 'bot' | 'user'

export const SLACK_BOT_SCOPES = [
  'channels:history',
  'channels:read',
  'users:read',
  'team:read',
  'chat:write',
  'commands',
]

export const SLACK_USER_SCOPES = [
  'channels:read',
  'channels:history',
  'groups:read',
  'groups:history',
  'im:read',
  'im:history',
  'mpim:read',
  'mpim:history',
  'users:read',
  'team:read',
]

export function parseSlackMode(value: string | null | undefined): SlackConnectionMode {
  return value === 'user' ? 'user' : 'bot'
}

export function buildSlackAuthorizeUrl(input: {
  clientId: string
  redirectUri: string
  state: string
  mode: SlackConnectionMode
  teamId?: string | null
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
  })
  const teamId = input.teamId?.trim()
  if (teamId) params.set('team', teamId)
  if (input.mode === 'user') {
    params.set('scope', '')
    params.set('user_scope', SLACK_USER_SCOPES.join(','))
  } else {
    params.set('scope', SLACK_BOT_SCOPES.join(','))
  }
  return `https://slack.com/oauth/v2/authorize?${params}`
}

export function friendlySlackOAuthError(code: string | undefined): {
  reason: string
  adminApproval: boolean
  distributionRequired: boolean
} {
  const normalized = code?.trim() || 'oauth_failed'
  const distributionRequired = normalized === 'invalid_team_for_non_distributed_app'
  const adminApproval = new Set([
    'app_not_approved',
    'missing_scope',
    'not_allowed_token_type',
    'admin_approval_required',
    'access_denied',
  ]).has(normalized)
  return { reason: normalized, adminApproval, distributionRequired }
}

export function getSlackRedirectUri(): string {
  const configured = process.env.SLACK_REDIRECT_URI?.trim()
  if (configured) return configured
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
    || (process.env.NODE_ENV === 'production' ? 'https://app.tryneuron.net' : 'http://localhost:3000')
  return `${base}/api/integrations/slack/callback`
}
