import { decrypt, encrypt } from '@/lib/crypto'
import { getJiraConfig } from './config'

const ATLASSIAN_API_BASE = 'https://api.atlassian.com'

export class JiraApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
    this.name = 'JiraApiError'
  }
}

export interface StoredJiraToken {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

interface AtlassianTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export interface JiraAccessibleResource {
  id: string
  url: string
  name?: string
  scopes?: string[]
  avatarUrl?: string
}

export interface JiraUser {
  accountId?: string
  displayName?: string
  emailAddress?: string
}

export interface JiraIssue {
  id: string
  key: string
  self?: string
  fields: {
    summary?: string
    description?: unknown
    status?: { name?: string }
    priority?: { name?: string }
    assignee?: JiraUser | null
    reporter?: JiraUser | null
    labels?: string[]
    updated?: string
    created?: string
    issuetype?: { name?: string }
    project?: { key?: string; name?: string }
    comment?: { comments?: JiraComment[]; total?: number }
  }
}

export interface JiraComment {
  id: string
  body?: unknown
  created?: string
  updated?: string
  author?: JiraUser
}

interface JiraSearchResponse {
  issues?: JiraIssue[]
  total?: number
  startAt?: number
  maxResults?: number
}

interface JiraCommentsResponse {
  comments?: JiraComment[]
  total?: number
}

function tokenUrl(): string {
  return 'https://auth.atlassian.com/oauth/token'
}

export function encodeJiraToken(token: StoredJiraToken): string {
  return encrypt(JSON.stringify(token))
}

export function decodeJiraToken(encrypted: string): StoredJiraToken | null {
  try {
    const parsed = JSON.parse(decrypt(encrypted)) as Partial<StoredJiraToken>
    if (!parsed.accessToken || !parsed.refreshToken || typeof parsed.expiresAt !== 'number') return null
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    return null
  }
}

export async function exchangeJiraCode(code: string): Promise<StoredJiraToken> {
  const config = getJiraConfig()
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new JiraApiError('Jira OAuth is not configured', 500, 'not_configured')
  }

  const response = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  })
  const data = await response.json().catch(() => ({})) as AtlassianTokenResponse
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new JiraApiError('Atlassian token exchange failed', response.status, data.error)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  }
}

export async function refreshJiraToken(token: StoredJiraToken): Promise<StoredJiraToken> {
  if (token.expiresAt > Date.now() + 120_000) return token

  const config = getJiraConfig()
  if (!config.clientId || !config.clientSecret) {
    throw new JiraApiError('Jira OAuth is not configured', 500, 'not_configured')
  }

  const response = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: token.refreshToken,
    }),
  })
  const data = await response.json().catch(() => ({})) as AtlassianTokenResponse
  if (!response.ok || !data.access_token) {
    throw new JiraApiError('Atlassian token refresh failed', response.status, data.error)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? token.refreshToken,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  }
}

function retryAfterMs(value: string | null): number {
  if (!value) return 1000
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 0), 5000)
  const date = Date.parse(value)
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 5000)
  return 1000
}

async function jiraFetch<T>(accessToken: string, url: string, init: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (response.status === 429 && retry) {
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response.headers.get('retry-after'))))
    return jiraFetch<T>(accessToken, url, init, false)
  }
  const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
  if (!response.ok) {
    throw new JiraApiError('Jira API request failed', response.status, data.error)
  }
  return data as T
}

export async function getAccessibleJiraResources(accessToken: string): Promise<JiraAccessibleResource[]> {
  return jiraFetch<JiraAccessibleResource[]>(accessToken, `${ATLASSIAN_API_BASE}/oauth/token/accessible-resources`)
}

export async function searchJiraIssues(params: {
  accessToken: string
  cloudId: string
  jql: string
  startAt: number
  maxResults: number
}): Promise<JiraSearchResponse> {
  const fields = [
    'summary',
    'description',
    'status',
    'priority',
    'assignee',
    'reporter',
    'labels',
    'updated',
    'created',
    'issuetype',
    'project',
    'comment',
  ]
  return jiraFetch<JiraSearchResponse>(
    params.accessToken,
    `${ATLASSIAN_API_BASE}/ex/jira/${encodeURIComponent(params.cloudId)}/rest/api/3/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        jql: params.jql,
        startAt: params.startAt,
        maxResults: params.maxResults,
        fields,
      }),
    },
  )
}

export async function getJiraIssueComments(params: {
  accessToken: string
  cloudId: string
  issueIdOrKey: string
  maxResults: number
}): Promise<JiraCommentsResponse> {
  return jiraFetch<JiraCommentsResponse>(
    params.accessToken,
    `${ATLASSIAN_API_BASE}/ex/jira/${encodeURIComponent(params.cloudId)}/rest/api/3/issue/${encodeURIComponent(params.issueIdOrKey)}/comment?orderBy=-created&maxResults=${params.maxResults}`,
  )
}
