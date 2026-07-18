'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, MapPin, ShieldCheck, X } from 'lucide-react'

export default function TtEldSetupModal({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [usdot, setUsdot] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [providerToken, setProviderToken] = useState('')
  const [busy, setBusy] = useState<'test' | 'connect' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => setMounted(true), [])
  useEffect(() => { if (open) { setUsdot(''); setApiKey(''); setProviderToken(''); setMessage(null) } }, [open])
  if (!mounted || !open) return null

  async function submit(endpoint: 'test' | 'connect') {
    setBusy(endpoint); setMessage(null)
    try {
      const response = await fetch(`/api/integrations/tt-eld/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usdot: usdot.trim(), apiKey: apiKey.trim(), providerToken: providerToken.trim() }) })
      const data = await response.json() as { ok?: boolean; success?: boolean; message?: string; error?: string; unitsCount?: number }
      if (!response.ok || (!data.ok && !data.success)) throw new Error(data.message ?? data.error ?? 'TT ELD connection failed.')
      if (endpoint === 'test') setMessage(`Connection works. ${data.unitsCount ?? 0} live units found.`)
      else { setApiKey(''); setProviderToken(''); onConnected(); onClose() }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'TT ELD connection failed.') } finally { setBusy(null) }
  }

  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
    <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4"><div className="flex items-center gap-2"><MapPin className="h-5 w-5" /><h2 className="text-lg font-semibold">Connect TT ELD</h2></div><button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
      <div className="space-y-5 px-6 py-5">
        <p className="text-sm text-muted">Real-time ELD, GPS tracking, drivers, units, and route history.</p>
        {[["USDOT number", usdot, setUsdot, 'text'], ['x-api-key', apiKey, setApiKey, 'password'], ['provider-token', providerToken, setProviderToken, 'password']].map(([label, value, setter, type]) => <label key={label as string} className="block text-sm font-medium text-ink">{label as string}<input aria-label={label as string} type={type as string} autoComplete="off" value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} className="mt-1 w-full rounded-lg border border-warm px-3 py-2" /></label>)}
        <div className="rounded-xl border border-warm bg-cream p-4"><h3 className="font-semibold text-ink">How to connect TT ELD</h3><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted"><li>Open the TT ELD dashboard.</li><li>In the sidebar, scroll to More.</li><li>Open API Keys.</li><li>Create or copy your API key.</li><li>Copy your provider token.</li><li>Find your company USDOT number.</li><li>Paste all three values into Neuron.</li><li>Click Test connection.</li><li>Save and sync.</li></ol></div>
        <p className="flex gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4 shrink-0" />Neuron stores credentials encrypted and uses them only to read TT ELD data for your workspace.</p>
        {message && <p role="status" className="text-sm text-muted">{message}</p>}
        <div className="flex gap-3"><button disabled={Boolean(busy)} onClick={() => void submit('test')} className="rounded-lg border border-warm px-4 py-2 text-sm font-medium">{busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test connection'}</button><button disabled={Boolean(busy)} onClick={() => void submit('connect')} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">{busy === 'connect' ? 'Saving…' : 'Save and connect'}</button></div>
      </div>
    </div>
  </div>, document.body)
}
