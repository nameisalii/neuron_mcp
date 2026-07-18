const baseUrl = 'https://read.tteld.com'
const companyId = process.env.FIVE_ELD_COMPANY_ID?.trim() ?? ''
const usdot = process.env.FIVE_ELD_USDOT?.trim() ?? ''
const apiKey = process.env.FIVE_ELD_API_KEY?.trim() ?? ''
const providerToken = process.env.FIVE_ELD_PROVIDER_TOKEN?.trim() ?? ''

console.log(`companyIdPresent: ${companyId ? 'yes' : 'no'}`)
console.log(`usdotPresent: ${usdot ? 'yes' : 'no'}`)
console.log(`apiKeyPresent: ${apiKey ? 'yes' : 'no'}`)
console.log(`providerTokenPresent: ${providerToken ? 'yes' : 'no'}`)

if (!companyId || !usdot || !apiKey) {
  console.error('Missing required local Five ELD environment variables.')
  process.exitCode = 1
} else if (!/^\d+$/.test(companyId) || !/^\d+$/.test(usdot)) {
  console.error('Company ID and USDOT must be numeric strings.')
  process.exitCode = 1
} else {
  const headers = { 'x-api-key': apiKey, ...(providerToken ? { 'provider-token': providerToken } : {}), Accept: 'application/json' }
  const checks = [
    ['current_units', `/api/externalservice/current-units/${encodeURIComponent(usdot)}?page=1&perPage=1&is_active=true`],
    ['drivers', `/api/externalservice/drivers-list/${encodeURIComponent(usdot)}?page=1&perPage=1&is_active=true`],
    ['realtime_units', `/api/v2/units-by-usdot/${encodeURIComponent(usdot)}`],
  ]

  const classifications = []
  for (const [stage, path] of checks) {
    try {
      const response = await fetch(new URL(path, baseUrl), { headers, signal: AbortSignal.timeout(15_000) })
      const contentType = response.headers.get('content-type') ?? 'unknown'
      const text = await response.text()
      let shape = 'non-json'
      let count = null
      if (contentType.toLowerCase().includes('json')) {
        try {
          const json = JSON.parse(text)
          shape = Array.isArray(json) ? 'array' : json && typeof json === 'object' ? `object keys: ${Object.keys(json).sort().slice(0, 20).join(', ') || 'none'}` : typeof json
          count = Array.isArray(json) ? json.length : Array.isArray(json?.data) ? json.data.length : Array.isArray(json?.units) ? json.units.length : null
        } catch { shape = 'invalid-json' }
      }
      let providerTokenRequired = false
      if (contentType.toLowerCase().includes('json')) {
        try {
          const json = JSON.parse(text)
          const message = json && typeof json === 'object' && typeof json.message === 'string' ? json.message.toLowerCase() : ''
          providerTokenRequired = /provider.?token/.test(message) && /required|missing/.test(message)
        } catch {}
      }
      const classification = providerTokenRequired && !providerToken ? 'provider_token_required' : (response.status === 401 || response.status === 403) && !providerToken ? 'provider_token_likely_required_or_key_type_wrong' : response.status === 401 || response.status === 403 ? 'invalid_credentials' : response.status === 404 ? 'not_found' : response.ok ? 'success' : 'provider_error'
      classifications.push(classification)
      console.log(`${stage}: endpointPath=${path}`)
      console.log(`${stage}: status=${response.status}`)
      console.log(`${stage}: contentType=${contentType}`)
      console.log(`${stage}: responseShape=${shape}`)
      console.log(`${stage}: count=${count ?? 'unavailable'}`)
      console.log(`${stage}: classification=${classification}`)
      console.log(`${stage}: providerTokenPresent=${providerToken ? 'yes' : 'no'}`)
      console.log(`${stage}: apiKeyPresent=${apiKey ? 'yes' : 'no'}`)
    } catch (error) {
      classifications.push('network_or_timeout')
      console.error(`${stage}: endpointPath=${path}`)
      console.error(`${stage}: classification=${error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error'}`)
      console.error(`${stage}: providerTokenPresent=${providerToken ? 'yes' : 'no'}`)
      console.error(`${stage}: apiKeyPresent=${apiKey ? 'yes' : 'no'}`)
    }
  }
  if (classifications.length === checks.length && classifications.every((value) => value === 'provider_token_required' || value === 'provider_token_likely_required_or_key_type_wrong')) {
    console.error(classifications.every((value) => value === 'provider_token_required') ? 'provider_token_required' : 'provider_token_likely_required_or_key_type_wrong')
    console.error('Generate a new Five ELD API key with Type = Highway. If Highway still fails, ask Five ELD support for provider-token.')
  }
}
