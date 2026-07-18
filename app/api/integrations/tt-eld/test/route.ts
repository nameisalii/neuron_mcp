import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { TtEldError, ttEldFriendlyError } from '@/lib/tteld/client'
import { FiveEldInputSchema, fiveEldPresence, fiveEldValidationIssues } from '@/lib/tteld/input'
import { primaryProbeError, probeFiveEldCapabilities } from '@/lib/tteld/probe'

const paths = {
  current_units: '/api/externalservice/current-units/:usdot',
  drivers: '/api/externalservice/drivers-list/:usdot',
  realtime_units_by_usdot: '/api/v2/units-by-usdot/:usdot',
} as const

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, code: 'validation_error', message: 'Please fill in Company ID, USDOT, and API key.', issues: [{ field: 'request', message: 'A valid JSON body is required' }], stage: 'input_validation', status: 400, detailsSafe: { companyIdPresent: false, usdotPresent: false, apiKeyPresent: false, providerTokenPresent: false, companyIdLength: 0, usdotLength: 0, apiKeyLength: 0 } }, { status: 400 }) }
  const presence = fiveEldPresence(body)
  const parsed = FiveEldInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, code: 'validation_error', message: 'Please fill in Company ID, USDOT, and API key.', issues: fiveEldValidationIssues(parsed.error), stage: 'input_validation', status: 400, detailsSafe: presence }, { status: 400 })

  const result = await probeFiveEldCapabilities(parsed.data)
  if (result.ok) {
    const limited = !result.capabilities.realtimeUnitsByUsdot
    return NextResponse.json({
      ok: true,
      capabilities: result.capabilities,
      warnings: result.warnings,
      counts: result.counts,
      requiredAuthMode: parsed.data.providerToken ? 'api_key_and_provider_token' : 'api_key',
      message: limited
        ? 'Five ELD connected. Neuron can read trucks, drivers, and assignments. Live GPS by USDOT was not available for this account, so live location questions may require VIN-based tracking or additional API access.'
        : 'Five ELD connected with live GPS.',
    })
  }

  const allNotFound = result.failures.length === 3 && result.failures.every(({ error }) => error instanceof TtEldError && error.code === 'not_found')
  const failure = primaryProbeError(result)
  const error = failure?.error
  const typed = error instanceof TtEldError ? error : null
  const unauthorized = typed?.code === 'unauthorized'
  const providerMissing = !parsed.data.providerToken && (unauthorized || typed?.detailsSafe.providerTokenRequired === true)
  const stage = failure?.stage ?? 'current_units'
  const endpointPath = paths[stage]
  const network = typed?.code === 'timeout' || (typed?.code === 'provider_error' && typed.status === undefined)
  const code = allNotFound ? 'endpoint_set_not_found' : providerMissing ? 'missing_provider_token_or_invalid_api_key' : unauthorized ? 'invalid_credentials' : typed?.code === 'invalid_response' ? 'unexpected_shape' : network ? 'network_or_timeout' : typed?.code ?? 'connection_failed'
  const message = allNotFound
    ? 'Neuron could not find Five ELD data for this USDOT or endpoint set. Check that the USDOT matches the company and ask Five ELD which read API endpoints are enabled for your account.'
    : providerMissing
      ? 'Five ELD rejected the API key or requires a provider token. If you generated an API key in Five ELD, make sure the key type is Highway. If it still fails, ask Five ELD support for the provider token required for external API access.'
      : unauthorized
        ? 'Five ELD rejected these credentials. Check the API key, provider token, and USDOT.'
        : typed?.code === 'invalid_response'
          ? 'Five ELD responded, but the response shape was different than expected. Neuron needs an updated parser for this endpoint.'
          : network
            ? 'Neuron could not reach Five ELD. Try again in a moment.'
            : ttEldFriendlyError(error)
  return NextResponse.json({
    ok: false, code, stage, status: 422, upstreamStatus: typed?.status ?? 422, message,
    capabilities: result.capabilities, warnings: result.warnings,
    detailsSafe: { ...presence, endpointPath, method: 'GET', authModeTried: parsed.data.providerToken ? 'x-api-key + provider-token' : 'x-api-key', responseContentType: typed?.detailsSafe.responseContentType ?? null, responseTopLevelKeys: typed?.detailsSafe.responseTopLevelKeys ?? [] },
  }, { status: 422 })
}
