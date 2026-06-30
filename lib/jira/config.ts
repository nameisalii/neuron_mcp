const DEFAULT_REDIRECT_URI = 'http://localhost:3000/api/integrations/jira/callback'

function trim(value: string | undefined): string | null {
  const result = value?.trim()
  return result ? result : null
}

export const JIRA_SCOPES = [
  'offline_access',
  'read:jira-work',
  'read:jira-user',
]

export function getJiraConfig() {
  return {
    clientId: trim(process.env.ATLASSIAN_CLIENT_ID),
    clientSecret: trim(process.env.ATLASSIAN_CLIENT_SECRET),
    redirectUri: trim(process.env.ATLASSIAN_REDIRECT_URI) ?? DEFAULT_REDIRECT_URI,
  }
}

export function isJiraOAuthConfigured(): boolean {
  const config = getJiraConfig()
  return Boolean(config.clientId && config.clientSecret && config.redirectUri)
}

export function getJiraAuthorizeUrl(state: string): string | null {
  const config = getJiraConfig()
  if (!config.clientId || !config.redirectUri) return null

  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: config.clientId,
    scope: JIRA_SCOPES.join(' '),
    redirect_uri: config.redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  })

  return `https://auth.atlassian.com/authorize?${params}`
}
