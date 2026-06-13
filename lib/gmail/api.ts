import { getGmailClientId, getGmailClientSecret } from './config'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const PAGE_SIZE = 100

export interface GmailApiLabel {
  id: string
  name: string
  type: string
  messagesTotal?: number
  messagesUnread?: number
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessagePart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailMessagePart[]
}

export interface GmailMessageFull {
  id: string
  threadId: string
  labelIds?: string[]
  internalDate?: string
  payload?: GmailMessagePart & { headers?: GmailHeader[] }
}

export interface ParsedEmailMessage {
  messageId: string
  threadId: string
  subject: string
  from: string
  to: string[]
  date: string // ISO
  labelIds: string[]
  body: string
}

export class GmailApiError extends Error {
  status: number
  path: string

  constructor(status: number, path: string) {
    super(`Gmail API error ${status} on ${path}`)
    this.name = 'GmailApiError'
    this.status = status
    this.path = path
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/#inbox/${threadId}`
}

// Exchanges the stored refresh token for a short-lived access token at sync time.
export async function getAccessToken(refreshToken: string): Promise<string> {
  const clientId = getGmailClientId()
  const clientSecret = getGmailClientSecret()

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status}`)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('Gmail token refresh returned no access_token')
  return data.access_token
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new GmailApiError(res.status, path.split('?')[0])
  return (await res.json()) as T
}

export async function listLabels(accessToken: string): Promise<GmailApiLabel[]> {
  const data = await gmailFetch<{ labels?: GmailApiLabel[] }>(accessToken, '/labels')
  return data.labels ?? []
}

export async function getLabelDetail(accessToken: string, labelId: string): Promise<GmailApiLabel> {
  return gmailFetch<GmailApiLabel>(accessToken, `/labels/${encodeURIComponent(labelId)}`)
}

export function buildSearchQuery(
  afterDate: Date,
  senderFilter: string[],
  excludeFilter: string[] = [],
): string {
  const y = afterDate.getUTCFullYear()
  const m = String(afterDate.getUTCMonth() + 1).padStart(2, '0')
  const d = String(afterDate.getUTCDate()).padStart(2, '0')
  const parts = [`after:${y}/${m}/${d}`]
  const senders = senderFilter.map((s) => s.trim()).filter(Boolean)
  if (senders.length > 0) parts.push(`from:(${senders.join(' OR ')})`)
  const excluded = excludeFilter.map((s) => s.trim()).filter(Boolean)
  if (excluded.length > 0) parts.push(`-from:(${excluded.join(' OR ')})`)
  return parts.join(' ')
}

export interface MessageIdPage {
  ids: Array<{ id: string; threadId: string }>
  capped: boolean
}

export interface ListMessageIdsOptions {
  labelIds?: string[]
  query?: string
  cap: number
}

// Collects message ids for one Gmail search, paginating until done or `cap` ids are gathered.
export async function listMessageIds(
  accessToken: string,
  options: ListMessageIdsOptions,
): Promise<MessageIdPage> {
  const ids: Array<{ id: string; threadId: string }> = []
  let pageToken: string | undefined
  let capped = false
  const labelIds = options.labelIds?.map((labelId) => labelId.trim()).filter(Boolean) ?? []
  const query = options.query?.trim() ?? ''
  const cap = Math.max(1, options.cap)

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(PAGE_SIZE, cap - ids.length)),
      includeSpamTrash: 'false',
    })
    for (const labelId of labelIds) params.append('labelIds', labelId)
    if (pageToken) params.set('pageToken', pageToken)

    const page = await gmailFetch<{
      messages?: Array<{ id: string; threadId: string }>
      nextPageToken?: string
    }>(accessToken, `/messages?${params}`)

    ids.push(...(page.messages ?? []))
    pageToken = page.nextPageToken

    if (ids.length >= cap) {
      capped = ids.length > cap || Boolean(pageToken)
      ids.length = Math.min(ids.length, cap)
      break
    }
  } while (pageToken)

  return { ids, capped }
}

export async function listRecentMessageIds(
  accessToken: string,
  options: Omit<ListMessageIdsOptions, 'cap'> & { cap?: number } = {},
): Promise<MessageIdPage> {
  return listMessageIds(accessToken, {
    ...options,
    cap: options.cap ?? 5,
  })
}

export async function estimateMessageCount(
  accessToken: string,
  labelId: string,
  query: string,
): Promise<number> {
  const params = new URLSearchParams({
    labelIds: labelId,
    q: query,
    maxResults: '1',
    includeSpamTrash: 'false',
  })
  const data = await gmailFetch<{ resultSizeEstimate?: number }>(accessToken, `/messages?${params}`)
  return data.resultSizeEstimate ?? 0
}

export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessageFull> {
  return gmailFetch<GmailMessageFull>(accessToken, `/messages/${encodeURIComponent(messageId)}?format=full`)
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8')
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function findPartByMimeType(part: GmailMessagePart, mimeType: string): GmailMessagePart | null {
  if (part.mimeType === mimeType && part.body?.data) return part
  for (const child of part.parts ?? []) {
    const found = findPartByMimeType(child, mimeType)
    if (found) return found
  }
  return null
}

// Prefers text/plain; falls back to text/html with tags stripped.
export function extractBody(payload: GmailMessagePart): string {
  const plain = findPartByMimeType(payload, 'text/plain')
  if (plain?.body?.data) return decodeBase64Url(plain.body.data).trim()

  const html = findPartByMimeType(payload, 'text/html')
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data))

  return ''
}

function getHeader(headers: GmailHeader[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export function parseMessage(raw: GmailMessageFull): ParsedEmailMessage | null {
  if (!raw.payload) return null
  const headers = raw.payload.headers ?? []
  const body = extractBody(raw.payload)
  if (!body) return null

  const dateMs = raw.internalDate
    ? Number(raw.internalDate)
    : Date.parse(getHeader(headers, 'Date'))
  if (!Number.isFinite(dateMs)) return null

  const to = getHeader(headers, 'To')
    .split(',')
    .map((addr) => addr.trim())
    .filter(Boolean)

  return {
    messageId: raw.id,
    threadId: raw.threadId,
    subject: getHeader(headers, 'Subject') || '(no subject)',
    from: getHeader(headers, 'From'),
    to,
    date: new Date(dateMs).toISOString(),
    labelIds: raw.labelIds ?? [],
    body,
  }
}
