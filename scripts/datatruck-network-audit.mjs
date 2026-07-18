import fs from 'node:fs/promises'
import http from 'node:http'
import WebSocket from 'next/dist/compiled/ws/index.js'

const DEVTOOLS = 'http://127.0.0.1:9223'
const WAIT_MS = 6500

const modules = [
  ['All loads', 'https://app.datatruck.io/load-management/all/load-trip'],
  ['Live loads', 'https://app.datatruck.io/load-management/live'],
  ['My loads', 'https://app.datatruck.io/load-management/my-loads'],
  ['LTL trips', 'https://app.datatruck.io/load-management/ltl'],
  ['Loadboard', 'https://app.datatruck.io/load-builder'],
  ['Planning board', 'https://app.datatruck.io/planning-calendar/board/grid-view'],
  ['Dispatch board', 'https://app.datatruck.io/dispatch-board'],
  ['Invoice batches', 'https://app.datatruck.io/accounting/invoices/batches'],
  ['Driver settlements', 'https://app.datatruck.io/accounting/salary/driver-settlements'],
  ['Dispatcher settlements', 'https://app.datatruck.io/accounting/salary/dispatcher-salary'],
  ['Vendor settlements', 'https://app.datatruck.io/accounting/vendors/bills-batch'],
  ['Bills', 'https://app.datatruck.io/accounting/vendors/bills'],
  ['Charges', 'https://app.datatruck.io/accounting/salary/one-time-charges'],
  ['Transactions', 'https://app.datatruck.io/payroll/transactions'],
  ['Customers', 'https://app.datatruck.io/customer-management/main/all-customers'],
  ['Vendors', 'https://app.datatruck.io/customer-management/main/vendors'],
  ['Safety tasks', 'https://app.datatruck.io/safety/main/safety-tasks'],
  ['Compliance', 'https://app.datatruck.io/driver/safety-dashboard/compliance-report'],
  ['Trucks', 'https://app.datatruck.io/fleet-management/main/trucks'],
  ['Trailers', 'https://app.datatruck.io/fleet-management/main/trailers'],
  ['Inspections', 'https://app.datatruck.io/fleet-management/main/inspections-form'],
  ['Fleet board', 'https://app.datatruck.io/fleet-management/main/fleet-board'],
  ['Inventory', 'https://app.datatruck.io/fleet-management/main/inventory'],
  ['Work orders', 'https://app.datatruck.io/maintenance/main/work-order'],
  ['Fleet issues', 'https://app.datatruck.io/maintenance/main/fleet-issues-todo'],
  ['Drivers', 'https://app.datatruck.io/hr-management/main/drivers'],
  ['Users', 'https://app.datatruck.io/hr-management/users'],
  ['Reports', 'https://app.datatruck.io/report'],
  ['Fuel', 'https://app.datatruck.io/integrations/fuel/transactions'],
  ['Toll', 'https://app.datatruck.io/integrations/toll/transactions'],
  ['Money code', 'https://app.datatruck.io/integrations/money_code/transactions'],
  ['Cash advance', 'https://app.datatruck.io/cash-advance'],
  ['Scale', 'https://app.datatruck.io/integrations/scale'],
  ['Mailbox', 'https://app.datatruck.io/mailbox'],
]

const moduleHints = {
  'All loads': ['order/list/full', '/order/list/', '/api/v2/order'],
  'Live loads': ['/loads/searches', '/loads/', 'loadboards'],
  'My loads': ['my-loads'],
  'LTL trips': ['ltl', 'trip/list'],
  Loadboard: ['loadboards', '/loads/searches', '/loads/'],
  'Planning board': ['planning_calendar/calendar', 'capacity-list'],
  'Dispatch board': ['dispatch-board'],
  'Invoice batches': ['invoice/batches/list', 'invoice/batches'],
  'Driver settlements': ['salary/batches/list', 'salary/settlements/list'],
  'Dispatcher settlements': ['salary/dispatcher'],
  'Vendor settlements': ['vendor', 'bills-batch', 'salary/carrier'],
  Bills: ['vendor', 'bill'],
  Charges: ['one-time-charges', 'driver-balances', 'financial-types'],
  Transactions: ['salary/transactions'],
  Customers: ['customer'],
  Vendors: ['vendor'],
  'Safety tasks': ['safety', 'safety-task'],
  Compliance: ['compliance-report'],
  Trucks: ['truck'],
  Trailers: ['trailer'],
  Inspections: ['inspection'],
  'Fleet board': ['fleet-board', 'safety-board'],
  Inventory: ['inventory/assets'],
  'Work orders': ['work-order'],
  'Fleet issues': ['schedule-task', 'fleet-issues', 'task'],
  Drivers: ['driver/list', '/driver/'],
  Users: ['user/list', 'employee', 'dispatcher'],
  Reports: ['dashboard/report', 'monthly_report', 'weekly_report'],
  Fuel: ['fuel/transactions', '/fuel/'],
  Toll: ['toll/transactions', '/toll/'],
  'Money code': ['money-code', 'money-codes'],
  'Cash advance': ['cash-advance'],
  Scale: ['scale'],
  Mailbox: ['email', 'mailbox', 'emails'],
}

function requestJson(url) {
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

function firstKeys(value) {
  if (!value || typeof value !== 'object') return []
  const filter = (keys) => keys.filter((key) => !/token|secret|password|authorization|cookie|session|csrf|jwt|api[_-]?key/i.test(key))
  if (Array.isArray(value)) return value[0] && typeof value[0] === 'object' ? filter(Object.keys(value[0])).slice(0, 60) : []
  return filter(Object.keys(value)).slice(0, 80)
}

function nestedObjectKeys(value) {
  const out = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        out[key] = child[0] && typeof child[0] === 'object' ? firstKeys(child[0]).slice(0, 30) : []
      } else {
        out[key] = firstKeys(child).slice(0, 30)
      }
    }
  }
  return out
}

function findList(value) {
  if (Array.isArray(value)) return { list: value, path: '$' }
  if (!value || typeof value !== 'object') return { list: null, path: null }
  for (const key of ['results', 'data', 'items', 'rows', 'objects', 'list']) {
    if (Array.isArray(value[key])) return { list: value[key], path: key }
  }
  if (value.data && typeof value.data === 'object') {
    for (const key of ['results', 'items', 'rows', 'list']) {
      if (Array.isArray(value.data[key])) return { list: value.data[key], path: `data.${key}` }
    }
  }
  return { list: null, path: null }
}

function shapeFromJson(json) {
  const { list, path } = findList(json)
  const sample = list ? list[0] : Array.isArray(json) ? json[0] : json
  return {
    topLevelType: Array.isArray(json) ? 'array' : typeof json,
    topLevelKeys: firstKeys(json),
    resultPath: path,
    resultCount: list ? list.length : Array.isArray(json) ? json.length : null,
    firstResultKeys: firstKeys(sample),
    nestedObjectKeys: nestedObjectKeys(sample),
    paginationStyle: {
      count: Boolean(json && typeof json === 'object' && 'count' in json),
      next: Boolean(json && typeof json === 'object' && 'next' in json),
      previous: Boolean(json && typeof json === 'object' && 'previous' in json),
      page: Boolean(json && typeof json === 'object' && 'page' in json),
      pageSize: Boolean(json && typeof json === 'object' && ('page_size' in json || 'pageSize' in json || 'limit' in json)),
    },
  }
}

function isInterestingUrl(url) {
  return /\/api\/|openapi|invoice|settlement|bill|customer|compliance|inspection|fuel|toll|mail|order|driver|truck|trailer|work-order/i.test(url)
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url)
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|auth|session|csrf|key|signature|jwt|access/i.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]')
      }
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function headerSignals(headers = {}) {
  const keys = Object.keys(headers).reduce((set, key) => set.add(key.toLowerCase()), new Set())
  return {
    cookiePresent: keys.has('cookie'),
    authorizationHeaderPresent: keys.has('authorization'),
    csrfHeaderPresent: [...keys].some((key) => key.includes('csrf') || key.includes('xsrf')),
  }
}

function markdownTable(rows) {
  const header = '| Module | Endpoint | Method | Status | Auth signals | Records | Pagination | Recommendation |\n|---|---|---:|---:|---|---:|---|---|'
  const body = rows.map((row) => {
    const endpoint = safeEndpoint(row.requestUrl)
    const auth = [
      row.authSignals?.cookiePresent ? 'Cookie' : null,
      row.authSignals?.authorizationHeaderPresent ? 'Authorization' : null,
      row.authSignals?.csrfHeaderPresent ? 'CSRF' : null,
    ].filter(Boolean).join(', ') || 'None observed'
    return `| ${row.moduleName} | \`${endpoint}\` | ${row.method} | ${row.status ?? ''} | ${auth} | ${row.resultCount ?? ''} | ${row.pagination ?? ''} | ${row.recommendation} |`
  }).join('\n')
  return `${header}\n${body}`
}

function safeEndpoint(url) {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}${parsed.search ? parsed.search.replace(/\|/g, '%7C') : ''}`
  } catch {
    return sanitizeUrl(url)
  }
}

function classify(record) {
  if (!record.requestUrl.includes('/api/')) return 'UNSUPPORTED'
  if (record.requestUrl.includes('/api/v1/openapi/')) return 'OFFICIAL_OPEN_API'
  if (record.authSignals?.cookiePresent && record.authSignals?.authorizationHeaderPresent) return 'INTERNAL_API_SEPARATE_TOKEN'
  if (record.authSignals?.cookiePresent) return 'INTERNAL_API_BROWSER_SESSION'
  if (record.authSignals?.authorizationHeaderPresent) return 'INTERNAL_API_SEPARATE_TOKEN'
  return 'UNSUPPORTED'
}

function recommendation(record) {
  const type = classify(record)
  if (type === 'OFFICIAL_OPEN_API') return 'Existing/Open API connector'
  if (type === 'INTERNAL_API_BROWSER_SESSION') return 'Private API or secure browser-session connector; do not use personal cookies'
  if (type === 'INTERNAL_API_SEPARATE_TOKEN') return 'Investigate supported token flow before production'
  return 'Not enough evidence'
}

function relevanceScore(record, moduleName) {
  const url = record.requestUrl.toLowerCase()
  const hints = moduleHints[moduleName] ?? []
  const hintScore = hints.some((hint) => url.includes(hint.toLowerCase())) ? 100 : 0
  const appShellPenalty = /marketplace\/apps|feature-flags|user\/me|notification\/stats|app-storage|setup-guides|configuration\/configuration|maps.googleapis|api\/clients\/plans/.test(url) ? -80 : 0
  const apiScore = url.includes('/api/') ? 10 : 0
  const countScore = typeof record.resultCount === 'number' ? Math.min(record.resultCount, 30) : 0
  return hintScore + appShellPenalty + apiScore + countScore
}

async function main() {
  const targets = await requestJson(`${DEVTOOLS}/json/list`)
  const page = targets.find((target) => target.type === 'page')
  if (!page) throw new Error('No Chrome page target found')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const requests = new Map()
  let currentModule = null
  const moduleRecords = new Map()

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
    if (msg.method === 'Network.requestWillBeSent' && currentModule) {
      const req = msg.params.request
      if (['Fetch', 'XHR'].includes(msg.params.type) || isInterestingUrl(req.url)) {
        requests.set(msg.params.requestId, {
          pageUrl: msg.params.documentURL,
          moduleName: currentModule.name,
          requestUrl: sanitizeUrl(req.url),
          method: req.method,
          authSignals: headerSignals(req.headers),
          status: null,
          contentType: null,
          responseShape: null,
          resultCount: null,
          pagination: null,
          classification: null,
          recommendation: null,
        })
      }
    }
    if (msg.method === 'Network.responseReceived') {
      const record = requests.get(msg.params.requestId)
      if (!record) return
      record.status = msg.params.response.status
      record.contentType = msg.params.response.mimeType || msg.params.response.headers?.['content-type'] || msg.params.response.headers?.['Content-Type'] || null
      record.responseHeadersAuthSignals = headerSignals(msg.params.response.headers)
    }
    if (msg.method === 'Network.loadingFinished') {
      const record = requests.get(msg.params.requestId)
      if (!record) return
      const isJson = /json/i.test(record.contentType ?? '') || /\/api\//.test(record.requestUrl)
      if (isJson && record.status && record.status < 500) {
        try {
          const bodyResponse = await send('Network.getResponseBody', { requestId: msg.params.requestId })
          const body = bodyResponse.result?.body
          if (body && !bodyResponse.result?.base64Encoded) {
            const parsed = JSON.parse(body)
            const shape = shapeFromJson(parsed)
            record.responseShape = shape
            record.resultCount = shape.resultCount
            record.pagination = Object.entries(shape.paginationStyle).filter(([, value]) => value).map(([key]) => key).join(', ')
          }
        } catch {
          // Body unavailable, non-JSON, or already evicted. Keep request metadata.
        }
      }
      record.classification = classify(record)
      record.recommendation = recommendation(record)
    }
  })

  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })

  await send('Network.enable', { maxResourceBufferSize: 2_000_000, maxTotalBufferSize: 20_000_000 })
  await send('Page.enable')
  await send('Runtime.enable')

  for (const [name, url] of modules) {
    currentModule = { name, url }
    requests.clear()
    await send('Page.navigate', { url })
    await sleep(WAIT_MS)
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)', returnByValue: true })
    await sleep(1500)
    const snapshot = [...requests.values()]
      .filter((record) => record.status || isInterestingUrl(record.requestUrl))
      .filter((record) => record.requestUrl.includes('/api/') || record.resultCount !== null)
    moduleRecords.set(name, {
      url,
      records: snapshot,
    })
    console.log(`${name}: ${snapshot.length} candidate requests`)
  }

  const bestRows = []
  const sections = []
  for (const [moduleName, info] of moduleRecords.entries()) {
    const candidates = info.records
      .filter((record) => record.status && record.status < 400)
      .sort((a, b) => {
        return relevanceScore(b, moduleName) - relevanceScore(a, moduleName)
      })
    const best = candidates.find((record) => relevanceScore(record, moduleName) > 0) ?? candidates[0] ?? info.records[0]
    if (best) bestRows.push(best)
    const rows = info.records.map((record) => [
      `- ${record.method} ${safeEndpoint(record.requestUrl)}`,
      `  - status: ${record.status ?? 'unknown'}`,
      `  - contentType: ${record.contentType ?? 'unknown'}`,
      `  - authSignals: cookie=${Boolean(record.authSignals?.cookiePresent)}, authorization=${Boolean(record.authSignals?.authorizationHeaderPresent)}, csrf=${Boolean(record.authSignals?.csrfHeaderPresent)}`,
      `  - classification: ${record.classification ?? classify(record)}`,
      `  - resultCount: ${record.resultCount ?? 'unknown'}`,
      `  - pagination: ${record.pagination || 'not detected'}`,
      record.responseShape ? `  - topLevelKeys: ${record.responseShape.topLevelKeys.join(', ') || 'none'}` : '  - topLevelKeys: unavailable',
      record.responseShape ? `  - firstResultKeys: ${record.responseShape.firstResultKeys.join(', ') || 'none'}` : '  - firstResultKeys: unavailable',
      record.responseShape ? `  - nestedObjectKeys: ${JSON.stringify(record.responseShape.nestedObjectKeys)}` : '  - nestedObjectKeys: unavailable',
    ].join('\n')).join('\n')
    sections.push(`### ${moduleName}\n\nFrontend: ${info.url}\n\n${rows || '- No candidate Fetch/XHR API request captured.'}`)
  }

  const date = new Date().toISOString()
  const output = `# Datatruck Network Audit\n\nDate: ${date}\n\nThis audit was captured from an authenticated local browser session. Cookies, Authorization values, CSRF values, session IDs, JWTs, API keys, and raw records are intentionally omitted.\n\n## Summary Matrix\n\n${markdownTable(bestRows)}\n\n## Module Details\n\n${sections.join('\n\n')}\n\n## Auth Classification Legend\n\n- OFFICIAL_OPEN_API: request used /api/v1/openapi/ and is compatible with the existing Open API-token strategy.\n- INTERNAL_API_BROWSER_SESSION: request appears to depend on browser cookies. Do not productionize with a personal session cookie.\n- INTERNAL_API_SEPARATE_TOKEN: request includes Authorization and needs a supported token acquisition flow before production use.\n- UNSUPPORTED: no usable API evidence captured in this audit.\n\n## Recommended Strategy\n\nKeep the existing six confirmed Open API endpoints as the production connector baseline. For internal browser-session endpoints, ask Datatruck for official partner/private API access or design a secure per-workspace browser-session connector with encrypted session storage, explicit customer authorization, rotation/expiry handling, and strong tenant isolation. Do not copy local browser cookies into env vars or production configuration.\n`
  await fs.writeFile('docs/datatruck-network-audit.md', output)
  ws.close()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
