import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { MAX_REDIRECTS, REQUEST_TIMEOUT_MS } from './constants'

export type SsrfResult =
  | { safe: true; url: string }
  | { safe: false; reason: 'invalid_url' | 'https_required' | 'port_blocked' | 'private_host' | 'dns_private' | 'dns_error' }

function isPrivateIpv4(host: string): boolean {
  const octets = host.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === '::' || normalized === '::1') return true
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIpv4(mapped[1]) : false
}

function isPrivateIp(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, '')
  return isIP(normalized) === 4 ? isPrivateIpv4(normalized) : isIP(normalized) === 6 ? isPrivateIpv6(normalized) : false
}

export async function checkSafeUrl(value: string, options: { resolveDns?: boolean } = {}): Promise<SsrfResult> {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { safe: false, reason: 'invalid_url' }
  }
  if (parsed.protocol !== 'https:') return { safe: false, reason: 'https_required' }
  if (parsed.port && parsed.port !== '443') return { safe: false, reason: 'port_blocked' }

  const asciiHost = domainToASCII(parsed.hostname).toLowerCase().replace(/\.$/, '')
  if (
    !asciiHost ||
    asciiHost === 'localhost' ||
    asciiHost.endsWith('.localhost') ||
    asciiHost.endsWith('.internal') ||
    asciiHost.endsWith('.local') ||
    asciiHost.endsWith('.lan') ||
    isPrivateIp(asciiHost)
  ) {
    return { safe: false, reason: 'private_host' }
  }

  if (options.resolveDns !== false && isIP(asciiHost) === 0) {
    try {
      const addresses = await lookup(asciiHost, { all: true, verbatim: true })
      if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
        return { safe: false, reason: 'dns_private' }
      }
    } catch {
      return { safe: false, reason: 'dns_error' }
    }
  }

  parsed.hostname = asciiHost
  return { safe: true, url: parsed.toString() }
}

export async function resolveSafeRedirects(
  initialUrl: string,
  options: { fetchImpl?: typeof fetch; maxRedirects?: number; timeoutMs?: number } = {},
): Promise<{ ok: true; finalUrl: string } | { ok: false; errorCode: string; statusCode?: number }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
  let current = initialUrl

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const guard = await checkSafeUrl(current)
    if (!guard.safe) return { ok: false, errorCode: 'ssrf_blocked' }
    current = guard.url

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    try {
      const response = await fetchImpl(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Neuron-Link-Enrichment/1.0' },
      })
      if (response.status < 300 || response.status >= 400) return { ok: true, finalUrl: current }
      const location = response.headers.get('location')
      if (!location) return { ok: true, finalUrl: current }
      if (redirectCount === maxRedirects) return { ok: false, errorCode: 'too_many_redirects' }
      current = new URL(location, current).toString()
    } catch {
      // Some public sites reject HEAD. Firecrawl can still scrape them; the
      // initial URL has already passed SSRF and Firecrawl's final URL is
      // revalidated after scraping.
      return { ok: true, finalUrl: current }
    } finally {
      clearTimeout(timeout)
    }
  }
  return { ok: false, errorCode: 'too_many_redirects' }
}
