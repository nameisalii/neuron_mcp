'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Clipboard, Loader2, MapPin, RefreshCw, ShieldCheck, Truck } from 'lucide-react'

type FleetUnit = { truckNumber: string; driver: string | null; vin: string; coordinates: { lat: number; lng: number } | null; speed: number | null; rotation: number | null; timestamp: string | null; freshnessSeconds: number | null; stale: boolean }
type Props = { connected: boolean; initialCompanyId?: string; initialUsdot?: string; lastSyncAt?: string | null; initialLiveGps?: boolean }
type SafeDetails = { endpointPath?: string; authModeTried?: string; apiKeyPresent?: boolean; providerTokenPresent?: boolean; usdotPresent?: boolean; companyIdPresent?: boolean; responseContentType?: string | null; responseTopLevelKeys?: string[] }
type ErrorDetails = { stage?: string; code?: string; status?: number; upstreamStatus?: number; detailsSafe?: SafeDetails }

class FiveEldRequestError extends Error {
  constructor(message: string, public safe: ErrorDetails) { super(message) }
}

const steps = [
  <>Log in to your <a className="font-medium underline" href="https://dash.fiveeld.com" target="_blank" rel="noreferrer">Five ELD dashboard</a>.</>,
  <>In the left sidebar, open <strong>More → API Keys</strong>.</>,
  <>Click <strong>Add Key</strong>.</>,
  <>Name the key <code className="rounded bg-white px-1.5 py-0.5">Neuron</code>.</>,
  <>Copy the generated API key.</>,
  <>Copy your Company ID from the top-right under your company name.</>,
  <>Find your company USDOT number used for fleet and ELD records.</>,
  <>Paste Company ID, USDOT number, API key, and provider token if required.</>,
  <>Click <strong>Test connection</strong>.</>,
  <>After the test succeeds, click <strong>Save connection</strong>.</>,
]

export default function FiveEldConnectionPanel({ connected: initiallyConnected, initialCompanyId = '', initialUsdot = '', lastSyncAt, initialLiveGps = false }: Props) {
  const router = useRouter()
  const [connected, setConnected] = useState(initiallyConnected)
  const [companyId, setCompanyId] = useState(initialCompanyId)
  const [usdot, setUsdot] = useState(initialUsdot)
  const [apiKey, setApiKey] = useState('')
  const [providerToken, setProviderToken] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | 'sync' | 'disconnect' | 'refresh' | null>(null)
  const [testedSignature, setTestedSignature] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string; details?: ErrorDetails } | null>(null)
  const [units, setUnits] = useState<FleetUnit[]>([])
  const [liveGps, setLiveGps] = useState(initialLiveGps)

  const payload = useMemo(() => ({ companyId: companyId.trim(), usdot: usdot.trim(), apiKey: apiKey.trim(), providerToken: providerToken.trim() }), [companyId, usdot, apiKey, providerToken])
  const signature = JSON.stringify(payload)
  const requiredComplete = Boolean(payload.companyId && payload.usdot && payload.apiKey)
  const canSave = requiredComplete && testedSignature === signature && busy === null

  async function request(path: string, method: string, body?: object) {
    const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = await response.json() as { error?: string; message?: string; ok?: boolean; success?: boolean; units?: FleetUnit[] } & ErrorDetails
    if (!response.ok || data.ok === false || data.success === false) throw new FiveEldRequestError(data.message ?? data.error ?? 'Neuron could not connect to Five ELD. Please check your credentials and try again.', { stage: data.stage, code: data.code, status: response.status, upstreamStatus: data.upstreamStatus, detailsSafe: data.detailsSafe })
    return data
  }

  async function testConnection() {
    if (!requiredComplete) return setNotice({ kind: 'error', text: 'Company ID, USDOT number, and API key are required.' })
    setBusy('test'); setNotice(null); setTestedSignature(null)
    try { const data = await request('/api/integrations/five-eld/test', 'POST', payload) as { message?: string; capabilities?: { realtimeUnitsByUsdot?: boolean } }; setLiveGps(data.capabilities?.realtimeUnitsByUsdot === true); setTestedSignature(signature); setNotice({ kind: 'success', text: data.message ?? 'Connection test passed. You can now save this connection.' }) }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Neuron could not connect to Five ELD. Please check your credentials and try again.', details: error instanceof FiveEldRequestError ? error.safe : undefined }) }
    finally { setBusy(null) }
  }

  async function saveConnection() {
    if (!canSave) return
    setBusy('save'); setNotice(null)
    try { const data = await request('/api/integrations/five-eld/connect', 'POST', payload) as { message?: string; capabilities?: { realtimeUnitsByUsdot?: boolean } }; setLiveGps(data.capabilities?.realtimeUnitsByUsdot === true); setConnected(true); setApiKey(''); setProviderToken(''); setTestedSignature(null); setNotice({ kind: 'success', text: data.message ?? 'Five ELD connected successfully. Neuron can read fleet data for this workspace.' }); router.refresh() }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Neuron could not connect to Five ELD. Please check your credentials and try again.' }) }
    finally { setBusy(null) }
  }

  async function refreshFleet() {
    setBusy('refresh')
    try { const data = await request('/api/integrations/five-eld/live', 'GET'); setUnits(data.units ?? []) }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Live fleet data is temporarily unavailable.' }) }
    finally { setBusy(null) }
  }

  useEffect(() => { if (connected) void refreshFleet() }, [connected])

  async function sync() { setBusy('sync'); try { await request('/api/integrations/five-eld/sync', 'POST'); setNotice({ kind: 'success', text: 'Five ELD sync completed.' }); router.refresh() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Five ELD sync failed.' }) } finally { setBusy(null) } }
  async function disconnect() { if (!window.confirm('Disconnect Five ELD from this workspace? Existing knowledge will be kept.')) return; setBusy('disconnect'); try { await request('/api/integrations/five-eld/disconnect', 'DELETE'); setConnected(false); setUnits([]); setNotice({ kind: 'success', text: 'Five ELD disconnected.' }); router.refresh() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Five ELD could not be disconnected.' }) } finally { setBusy(null) } }

  return <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
    <section className="rounded-2xl border border-warm bg-white p-6 shadow-sm">
      <h2 className="text-xl font-display font-semibold">How to get your Five ELD API credentials</h2>
      <ol className="mt-5 space-y-4">{steps.map((step, index) => <li key={index} className="flex gap-3 text-sm text-muted"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">{index + 1}</span><span className="pt-1">{step}</span></li>)}</ol>
      <button type="button" onClick={() => void navigator.clipboard.writeText('Neuron')} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-warm px-3 py-2 text-sm"><Clipboard className="h-4 w-4" />Copy example key name: Neuron</button>
      <div className="mt-5 flex gap-3 rounded-xl border border-positive/20 bg-[#E6F2EC] p-4 text-sm text-positive"><ShieldCheck className="h-5 w-5 shrink-0" />Your API key is encrypted and used only to read Five ELD data for your Neuron workspace.</div>
      <div className="mt-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><AlertTriangle className="h-5 w-5 shrink-0" />If you accidentally share or expose your API key, delete it in Five ELD and create a new one.</div>
      <p className="mt-5 text-sm text-muted"><strong>Need help?</strong> Ask your Five ELD administrator to locate API Keys and your Company ID.</p>
    </section>

    <section className="space-y-5 rounded-2xl border border-warm bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-display font-semibold">Connection</h2><p className="text-sm text-muted">Credentials are private to this workspace.</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${connected ? 'bg-[#E6F2EC] text-positive' : 'bg-cream text-muted'}`}>{connected ? liveGps ? 'Connected with live GPS' : 'Connected with limited capabilities' : 'Not connected'}</span></div>
      {(['Company ID', 'USDOT number', 'API key', 'Provider token'] as const).map((label) => {
        const config = label === 'Company ID' ? { value: companyId, set: setCompanyId, placeholder: '1489081', help: 'Found in the top-right of your Five ELD dashboard under your company name.', type: 'text' } : label === 'USDOT number' ? { value: usdot, set: setUsdot, placeholder: '1234567', help: 'Your company’s USDOT number.', type: 'text' } : label === 'API key' ? { value: apiKey, set: setApiKey, placeholder: '', help: 'Create this in Five ELD → API Keys.', type: 'password' } : { value: providerToken, set: setProviderToken, placeholder: '', help: 'Optional. Some Five ELD / TT ELD APIs require a provider token.', type: 'password' }
        return <label key={label} className="block text-sm font-medium">{label}{label === 'Provider token' && <span className="ml-1 font-normal text-muted">(optional)</span>}<input aria-label={label} value={config.value} onChange={(event) => { config.set(event.target.value); setTestedSignature(null) }} type={config.type} placeholder={config.placeholder} autoComplete="off" className="mt-1 w-full rounded-lg border border-warm px-3 py-2" /><span className="mt-1 block text-xs font-normal text-muted">{config.help}</span></label>
      })}
      {notice && <div role="status" className={`rounded-xl p-3 text-sm ${notice.kind === 'success' ? 'bg-[#E6F2EC] text-positive' : 'bg-red-50 text-red-700'}`}><div className="flex gap-2">{notice.kind === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}<span>{notice.text}</span></div>{notice.kind === 'error' && notice.details && <details className="mt-3 border-t border-red-200 pt-2"><summary className="cursor-pointer font-medium">Technical details</summary><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">{[
        ['Stage', notice.details.stage], ['Code', notice.details.code], ['Endpoint', notice.details.detailsSafe?.endpointPath], ['HTTP status', notice.details.status], ['Upstream status', notice.details.upstreamStatus], ['Auth mode tried', notice.details.detailsSafe?.authModeTried], ['API key present', notice.details.detailsSafe?.apiKeyPresent === undefined ? undefined : notice.details.detailsSafe.apiKeyPresent ? 'yes' : 'no'], ['Provider token present', notice.details.detailsSafe?.providerTokenPresent === undefined ? undefined : notice.details.detailsSafe.providerTokenPresent ? 'yes' : 'no'], ['USDOT present', notice.details.detailsSafe?.usdotPresent === undefined ? undefined : notice.details.detailsSafe.usdotPresent ? 'yes' : 'no'], ['Company ID present', notice.details.detailsSafe?.companyIdPresent === undefined ? undefined : notice.details.detailsSafe.companyIdPresent ? 'yes' : 'no'], ['Response content-type', notice.details.detailsSafe?.responseContentType ?? undefined], ['Response shape keys', notice.details.detailsSafe?.responseTopLevelKeys?.join(', ') || 'none'],
      ].filter((item) => item[1] !== undefined).map(([label, value]) => <div key={String(label)} className="contents"><dt className="font-medium">{label}</dt><dd className="break-all">{String(value)}</dd></div>)}</dl></details>}</div>}
      {notice?.kind === 'error' && <div className="rounded-xl border border-warm bg-cream p-4 text-sm"><h3 className="font-semibold">Message Five ELD Support</h3><p className="mt-1 text-xs text-muted">Ask Five ELD which external read endpoints and identifiers are enabled for this account.</p><button type="button" onClick={() => void navigator.clipboard.writeText(`Hi Five ELD Support,\n\nWe are connecting our Five ELD account to Neuron using the external read API.\n\nCompany ID: ${companyId.trim()}\nUSDOT: ${usdot.trim()}\n\nWe generated an API key and have a provider token.\n\nThe endpoint /api/v2/units-by-usdot/:usdot returns 404 for our account.\n\nCan you please confirm:\n1. Which base URL should we use for Five ELD external API?\n2. Are these endpoints enabled for our account?\n   - /api/externalservice/current-units/:usdot\n   - /api/externalservice/drivers-list/:usdot\n   - /api/v2/units-by-usdot/:usdot\n   - /api/v2/unit-by-vin/:usdot/:vin\n   - /api/externalservice/trackings/:usdot/:vehicleId\n3. Should we use USDOT ${usdot.trim()}, Company ID ${companyId.trim()}, or another identifier in the path?\n4. For VIN tracking, should USDOT be ${usdot.trim()} or 0?\n\nThank you.`)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-warm bg-white px-3 py-2"><Clipboard className="h-4 w-4" />Copy support message</button></div>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={!requiredComplete || busy !== null} onClick={() => void testConnection()} className="inline-flex items-center gap-2 rounded-lg border border-warm px-4 py-2 text-sm disabled:opacity-50">{busy === 'test' && <Loader2 className="h-4 w-4 animate-spin" />}Test connection</button><button type="button" disabled={!canSave} onClick={() => void saveConnection()} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm text-white disabled:opacity-40">{busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}Save connection</button></div>
      {lastSyncAt && <p className="text-xs text-muted">Last sync: {new Date(lastSyncAt).toLocaleString()}</p>}
    </section>

    {connected && <section className="lg:col-span-2 rounded-2xl border border-warm bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-display font-semibold"><Truck className="h-5 w-5" />Live fleet preview</h2><p className="text-sm text-muted">Fresh locations were updated within 30 minutes.</p></div><div className="flex gap-2"><button onClick={() => void refreshFleet()} className="inline-flex items-center gap-2 rounded-lg border border-warm px-3 py-2 text-sm"><RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />Refresh live data</button><button onClick={() => void sync()} className="rounded-lg bg-ink px-3 py-2 text-sm text-white">Sync now</button><button onClick={() => void disconnect()} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">Disconnect</button></div></div><div className="mt-5 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-warm text-left text-muted">{['Truck', 'Driver', 'VIN', 'Speed', 'Heading', 'Last update', 'Location', 'Fresh/stale'].map((title) => <th key={title} className="px-3 py-2">{title}</th>)}</tr></thead><tbody>{units.map((unit) => <tr key={unit.vin} className="border-b border-warm/60"><td className="px-3 py-3 font-medium">{unit.truckNumber}</td><td className="px-3 py-3">{unit.driver ?? 'Unassigned'}</td><td className="px-3 py-3 font-mono text-xs">{unit.vin}</td><td className="px-3 py-3">{unit.speed === null ? '—' : `${unit.speed} mph`}</td><td className="px-3 py-3">{unit.rotation === null ? '—' : `${unit.rotation}°`}</td><td className="px-3 py-3">{unit.timestamp ? new Date(unit.timestamp).toLocaleString() : 'Unknown'}</td><td className="px-3 py-3">{unit.coordinates ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{unit.coordinates.lat.toFixed(6)}, {unit.coordinates.lng.toFixed(6)}</span> : 'Unavailable'}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${unit.freshnessSeconds === null ? 'bg-gray-100 text-gray-600' : unit.stale ? 'bg-amber-50 text-amber-700' : 'bg-[#E6F2EC] text-positive'}`}>{unit.freshnessSeconds === null ? 'Unknown' : unit.stale ? 'Stale' : 'Fresh'}</span></td></tr>)}</tbody></table>{units.length === 0 && <p className="py-8 text-center text-sm text-muted">No live units were returned.</p>}</div></section>}
  </div>
}
