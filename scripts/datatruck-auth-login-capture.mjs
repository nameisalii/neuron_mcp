import fs from 'node:fs/promises'
import http from 'node:http'
import WebSocket from 'next/dist/compiled/ws/index.js'

const port = process.argv[2] ?? '9225'
const outFile = process.argv[3] ?? '/tmp/datatruck-auth-login-capture.json'
const devtools = `http://127.0.0.1:${port}`
const durationMs = Number(process.argv[4] ?? 240000)

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    }).on('error', reject)
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAuthRelated(url) {
  return /login|auth|token|refresh|session|sign[-_]?in|cognito|user\/me|current-user|bootstrap|oauth|sso/i.test(url)
}

function safeUrl(url) {
  try {
    const parsed = new URL(url)
    for (const key of [...parsed.searchParams.keys()]) {
      parsed.searchParams.set(key, '[REDACTED]')
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function headerSignals(headers = {}) {
  const keys = Object.keys(headers).reduce((set, key) => set.add(key.toLowerCase()), new Set())
  const auth = headers.Authorization ?? headers.authorization
  return {
    authorizationHeaderPresent: Boolean(auth),
    authorizationScheme: typeof auth === 'string' ? auth.split(/\s+/)[0] : null,
    cookiePresent: keys.has('cookie'),
    csrfHeaderPresent: [...keys].some((key) => key.includes('csrf') || key.includes('xsrf')),
  }
}

function safeKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.keys(value).filter((key) => !/password|secret|token|authorization|cookie|session|csrf|jwt|api[_-]?key/i.test(key)).slice(0, 60)
}

function tokenFieldNames(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.keys(value).filter((key) => /token|access|refresh|idtoken|authenticationresult|challenge|session/i.test(key)).slice(0, 60)
}

function shape(payload) {
  const topLevel = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(topLevel?.results)
      ? topLevel.results
      : Array.isArray(topLevel?.data)
        ? topLevel.data
        : Array.isArray(topLevel?.items)
          ? topLevel.items
          : null
  const first = records?.[0]
  return {
    responseType: Array.isArray(payload) ? 'array' : typeof payload,
    responseFieldNames: safeKeys(topLevel),
    tokenLikeFieldNames: tokenFieldNames(topLevel),
    resultCount: Array.isArray(records) ? records.length : null,
    firstResultFieldNames: first && typeof first === 'object' && !Array.isArray(first) ? safeKeys(first) : [],
    pagination: Boolean(topLevel && ('count' in topLevel || 'next' in topLevel || 'previous' in topLevel)),
  }
}

function requestBodyFieldNames(postData, contentType) {
  if (!postData) return []
  if (!/json|x-www-form-urlencoded/i.test(contentType ?? '')) return ['unparsed_body_present']
  try {
    const parsed = JSON.parse(postData)
    return [...safeKeys(parsed), ...tokenFieldNames(parsed).map((key) => `${key} [token-like field]`)]
  } catch {
    try {
      return [...new URLSearchParams(postData).keys()].filter((key) => !/password|secret|token|authorization|cookie|session|csrf|jwt|api[_-]?key/i.test(key))
    } catch {
      return ['unparsed_body_present']
    }
  }
}

function normalizeStorageKey(key) {
  return key
    .replace(/CognitoIdentityServiceProvider\.([^.]+)\..*\.(accessToken|idToken|refreshToken|clockDrift|signInDetails)/, 'CognitoIdentityServiceProvider.<clientId>.<user>.$2')
    .replace(/CognitoIdentityServiceProvider\.([^.]+)\.LastAuthUser/, 'CognitoIdentityServiceProvider.<clientId>.LastAuthUser')
    .replace(/^[a-f0-9]{24}\.(email|givenName|surname|appUserId|clientId)$/i, '<analyticsUser>.$1')
}

async function main() {
  let targets = []
  for (let i = 0; i < 60; i++) {
    try {
      targets = await getJson(`${devtools}/json/list`)
      if (targets.some((target) => target.type === 'page')) break
    } catch {
      await sleep(500)
    }
  }
  const page = targets.find((target) => target.type === 'page')
  if (!page) throw new Error('No Chrome page target found')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const requests = new Map()
  const authEvents = []

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msg = { id: ++id, method, params }
      pending.set(msg.id, resolve)
      ws.send(JSON.stringify(msg))
    })
  }

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
      return
    }
    if (msg.method === 'Network.requestWillBeSent') {
      const req = msg.params.request
      if (!isAuthRelated(req.url)) return
      const event = {
        url: safeUrl(req.url),
        method: req.method,
        status: null,
        requestContentType: req.headers?.['content-type'] ?? req.headers?.['Content-Type'] ?? null,
        ...headerSignals(req.headers),
        responseContentType: null,
        responseShape: null,
      }
      event.requestFieldNames = requestBodyFieldNames(req.postData, event.requestContentType)
      requests.set(msg.params.requestId, event)
      authEvents.push(event)
    }
    if (msg.method === 'Network.responseReceived') {
      const event = requests.get(msg.params.requestId)
      if (!event) return
      event.status = msg.params.response.status
      event.responseContentType = msg.params.response.mimeType ?? null
    }
    if (msg.method === 'Network.loadingFinished') {
      const event = requests.get(msg.params.requestId)
      if (!event) return
      if (!/json/i.test(event.responseContentType ?? '') && !isAuthRelated(event.url)) return
      try {
        const bodyResponse = await send('Network.getResponseBody', { requestId: msg.params.requestId })
        if (bodyResponse.result?.body && !bodyResponse.result?.base64Encoded) {
          event.responseShape = shape(JSON.parse(bodyResponse.result.body))
        }
      } catch {
        event.responseShape = null
      }
    }
  })

  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  await send('Network.enable', { maxResourceBufferSize: 2_000_000, maxTotalBufferSize: 20_000_000 })
  await send('Page.enable')
  await send('Runtime.enable')
  console.log('READY_FOR_LOGIN')

  await sleep(durationMs)

  const storageResult = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(() => {
      function rows(store, type) {
        return Object.keys(store).sort().map((key) => {
          const value = store.getItem(key) || ''
          const jwtLike = /^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/.test(value)
          let expiry = null
          let approxLifetimeMinutes = null
          if (jwtLike) {
            try {
              const payload = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
              if (typeof payload.exp === 'number') expiry = new Date(payload.exp * 1000).toISOString()
              if (typeof payload.exp === 'number' && typeof payload.iat === 'number') approxLifetimeMinutes = Math.round((payload.exp - payload.iat) / 60)
            } catch {}
          }
          return { storageType: type, keyName: key, valueType: typeof value, valueLength: value.length, jwtLike, expiry, approxLifetimeMinutes }
        })
      }
      return { localStorage: rows(localStorage, 'localStorage'), sessionStorage: rows(sessionStorage, 'sessionStorage') }
    })()`,
  })

  const cookies = await send('Network.getAllCookies')
  const storage = storageResult.result?.result?.value ?? { localStorage: [], sessionStorage: [] }
  storage.localStorage = storage.localStorage.map((row) => ({ ...row, keyName: normalizeStorageKey(row.keyName) }))
  storage.sessionStorage = storage.sessionStorage.map((row) => ({ ...row, keyName: normalizeStorageKey(row.keyName) }))
  storage.cookies = cookies.result.cookies
    .filter((cookie) => cookie.domain.includes('datatruck'))
    .map((cookie) => ({
      storageType: 'cookie',
      keyName: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite ?? null,
      valueLength: cookie.size ?? null,
    }))

  const output = {
    capturedAt: new Date().toISOString(),
    authEvents,
    storage,
  }
  await fs.writeFile(outFile, JSON.stringify(output, null, 2))
  console.log(`WROTE ${outFile}`)
  ws.close()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
