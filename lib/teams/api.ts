import { decrypt, encrypt } from '@/lib/crypto'
import { getTeamsConfig } from './config'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export class TeamsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
    this.name = 'TeamsApiError'
  }
}

export interface MicrosoftTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export interface StoredTeamsToken {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface TeamsUserProfile {
  id?: string
  displayName?: string
  userPrincipalName?: string
}

export interface GraphTeam {
  id: string
  displayName?: string
}

export interface GraphChannel {
  id: string
  displayName?: string
  membershipType?: string
}

export interface GraphChannelMessage {
  id: string
  replyToId?: string | null
  etag?: string
  messageType?: string
  createdDateTime?: string
  lastModifiedDateTime?: string
  deletedDateTime?: string | null
  webUrl?: string | null
  from?: {
    user?: {
      id?: string
      displayName?: string
    } | null
    application?: {
      id?: string
      displayName?: string
    } | null
  } | null
  body?: {
    contentType?: string
    content?: string | null
  } | null
}

interface GraphList<T> {
  value?: T[]
  '@odata.nextLink'?: string
}

function tokenEndpoint(): string {
  const { tenantId } = getTeamsConfig()
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`
}

export function encodeTeamsToken(token: StoredTeamsToken): string {
  return encrypt(JSON.stringify(token))
}

export function decodeTeamsToken(encrypted: string): StoredTeamsToken | null {
  try {
    const parsed = JSON.parse(decrypt(encrypted)) as Partial<StoredTeamsToken>
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

export async function exchangeTeamsCode(code: string): Promise<StoredTeamsToken> {
  const config = getTeamsConfig()
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new TeamsApiError('Microsoft Teams OAuth is not configured', 500, 'not_configured')
  }

  const response = await fetch(tokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }),
  })
  const data = await response.json().catch(() => ({})) as MicrosoftTokenResponse
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new TeamsApiError('Microsoft token exchange failed', response.status, data.error)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  }
}

export async function refreshTeamsToken(token: StoredTeamsToken): Promise<StoredTeamsToken> {
  if (token.expiresAt > Date.now() + 120_000) return token

  const config = getTeamsConfig()
  if (!config.clientId || !config.clientSecret) {
    throw new TeamsApiError('Microsoft Teams OAuth is not configured', 500, 'not_configured')
  }

  const response = await fetch(tokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    }),
  })
  const data = await response.json().catch(() => ({})) as MicrosoftTokenResponse
  if (!response.ok || !data.access_token) {
    throw new TeamsApiError('Microsoft token refresh failed', response.status, data.error)
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

async function graphFetch<T>(accessToken: string, pathOrUrl: string, retry = true): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (response.status === 429 && retry) {
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response.headers.get('retry-after'))))
    return graphFetch<T>(accessToken, pathOrUrl, false)
  }
  const data = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
  if (!response.ok) {
    throw new TeamsApiError('Microsoft Graph request failed', response.status, data.error?.code)
  }
  return data as T
}

export async function getTeamsProfile(accessToken: string): Promise<TeamsUserProfile | null> {
  try {
    return await graphFetch<TeamsUserProfile>(accessToken, '/me?$select=id,displayName,userPrincipalName')
  } catch {
    return null
  }
}

async function graphListAll<T>(accessToken: string, path: string, limit: number): Promise<T[]> {
  const results: T[] = []
  let next: string | undefined = path
  while (next && results.length < limit) {
    const page: GraphList<T> = await graphFetch<GraphList<T>>(accessToken, next)
    results.push(...(page.value ?? []))
    next = page['@odata.nextLink']
  }
  return results.slice(0, limit)
}

export async function listJoinedTeams(accessToken: string, limit = 25): Promise<GraphTeam[]> {
  return graphListAll<GraphTeam>(accessToken, '/me/joinedTeams?$select=id,displayName', limit)
}

export async function listTeamChannels(accessToken: string, teamId: string, limit = 50): Promise<GraphChannel[]> {
  return graphListAll<GraphChannel>(
    accessToken,
    `/teams/${encodeURIComponent(teamId)}/channels?$select=id,displayName,membershipType`,
    limit,
  )
}

export async function listChannelMessages(
  accessToken: string,
  teamId: string,
  channelId: string,
  limit = 50,
): Promise<GraphChannelMessage[]> {
  return graphListAll<GraphChannelMessage>(
    accessToken,
    `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?$top=${Math.min(limit, 50)}`,
    limit,
  )
}
