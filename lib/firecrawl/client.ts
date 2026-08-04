import { firecrawlEnabled, REQUEST_TIMEOUT_MS } from '@/lib/enrich/constants'
import { checkSafeUrl, resolveSafeRedirects } from '@/lib/enrich/ssrfGuard'

if (typeof window !== 'undefined') {
  throw new Error('Firecrawl client is server-only')
}

export interface FirecrawlResult {
  ok: boolean
  url: string
  finalUrl?: string
  title?: string
  markdown?: string
  html?: string
  statusCode?: number
  errorCode?: string
  errorMessage?: string
}

type FirecrawlResponse = {
  success?: boolean
  data?: {
    markdown?: string
    html?: string
    metadata?: {
      title?: string
      sourceURL?: string
      url?: string
      statusCode?: number
    }
  }
  error?: string
}

export async function scrapeUrl(
  url: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<FirecrawlResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!firecrawlEnabled() || !apiKey) return { ok: false, url, errorCode: 'disabled' }

  const initialGuard = await checkSafeUrl(url)
  if (!initialGuard.safe) return { ok: false, url, errorCode: 'ssrf_blocked' }

  const fetchImpl = options.fetchImpl ?? fetch
  const redirect = await resolveSafeRedirects(initialGuard.url, {
    fetchImpl,
    timeoutMs: options.timeoutMs,
  })
  if (!redirect.ok) return { ok: false, url, errorCode: redirect.errorCode, statusCode: redirect.statusCode }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: redirect.finalUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        timeout: options.timeoutMs ?? REQUEST_TIMEOUT_MS,
      }),
    })
    const body = await response.json().catch(() => ({})) as FirecrawlResponse
    const finalUrl = body.data?.metadata?.sourceURL ?? body.data?.metadata?.url ?? redirect.finalUrl
    const finalGuard = await checkSafeUrl(finalUrl)
    if (!finalGuard.safe) return { ok: false, url, finalUrl, errorCode: 'ssrf_blocked' }
    if (!response.ok || body.success === false) {
      return {
        ok: false,
        url,
        finalUrl: finalGuard.url,
        statusCode: body.data?.metadata?.statusCode ?? response.status,
        errorCode: `http_${response.status}`,
        errorMessage: body.error?.slice(0, 200),
      }
    }
    return {
      ok: true,
      url,
      finalUrl: finalGuard.url,
      title: body.data?.metadata?.title,
      markdown: body.data?.markdown,
      html: body.data?.html,
      statusCode: body.data?.metadata?.statusCode ?? response.status,
    }
  } catch (error) {
    return {
      ok: false,
      url,
      errorCode: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'request_failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}
