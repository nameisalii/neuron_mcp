const ALLOWED_ROOT_DOMAIN = 'datatruck.io'
const FETCH_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_REDIRECTS = 3

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // link-local / cloud metadata
  /^\[?::1\]?$/,
  /^\[?fc/i,
  /^\[?fd/i,
  /^\[?fe80/i,
]

export interface DatatruckEndpointValidation {
  ok: true
  kind: 'relative' | 'full_url'
  value: string
}

export interface DatatruckEndpointValidationError {
  ok: false
  error: string
}

function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')
}

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

export function isAllowedDatatruckHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  if (isPrivateHost(normalized) || isIpLiteral(normalized)) return false
  return normalized === ALLOWED_ROOT_DOMAIN || normalized.endsWith(`.${ALLOWED_ROOT_DOMAIN}`)
}

/**
 * Validates a full URL for use as a custom Datatruck source.
 * HTTPS only, datatruck.io (or subdomain) only, no credentials in the URL.
 */
export function isAllowedDatatruckUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  return isAllowedDatatruckHostname(url.hostname)
}

/**
 * Validates user input for a custom endpoint: either a relative path
 * (resolved against the configured Datatruck API base URL) or a full
 * https://*.datatruck.io URL.
 */
export function validateDatatruckEndpointInput(input: string): DatatruckEndpointValidation | DatatruckEndpointValidationError {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Enter an endpoint path or full Datatruck URL.' }
  if (/[\r\n]/.test(trimmed)) return { ok: false, error: 'The endpoint contains invalid characters.' }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.toLowerCase().startsWith('//')) {
    if (trimmed.toLowerCase().startsWith('http://')) {
      return { ok: false, error: 'Only HTTPS Datatruck URLs are allowed.' }
    }
    if (!isAllowedDatatruckUrl(trimmed)) {
      return { ok: false, error: 'Full URLs must be HTTPS and point to a datatruck.io domain.' }
    }
    return { ok: true, kind: 'full_url', value: trimmed }
  }

  if (trimmed.includes('..')) return { ok: false, error: 'The endpoint path cannot contain "..".' }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return { ok: true, kind: 'relative', value: path }
}

export interface SafeDatatruckFetchResult {
  status: number
  contentType: string | null
  bodyText: string
  truncated: boolean
}

/**
 * Fetches a validated Datatruck URL with SSRF-safe transport rules:
 * manual redirect handling (same-domain only), timeout, and a response
 * size cap. Callers must validate the URL first.
 */
export async function fetchDatatruckSafe(url: string, headers: Record<string, string>): Promise<SafeDatatruckFetchResult> {
  if (!isAllowedDatatruckUrl(url)) {
    throw new Error('URL is not an allowed Datatruck URL')
  }

  let currentUrl = url
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        headers,
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Datatruck returned a redirect without a destination')
      const nextUrl = new URL(location, currentUrl).toString()
      if (!isAllowedDatatruckUrl(nextUrl)) {
        throw new Error('Datatruck redirected to a non-Datatruck domain')
      }
      currentUrl = nextUrl
      continue
    }

    const contentType = response.headers.get('content-type')
    const raw = await response.arrayBuffer()
    const truncated = raw.byteLength > MAX_RESPONSE_BYTES
    const bodyText = new TextDecoder().decode(truncated ? raw.slice(0, MAX_RESPONSE_BYTES) : raw)
    return { status: response.status, contentType, bodyText, truncated }
  }

  throw new Error('Datatruck returned too many redirects')
}
