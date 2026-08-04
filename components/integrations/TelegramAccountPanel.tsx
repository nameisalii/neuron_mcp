'use client'

import { useState } from 'react'
import TelegramAccountChatPicker from './TelegramAccountChatPicker'

export default function TelegramAccountPanel({
  enabled,
  initialStatus,
  displayName,
  username,
  initialSelectedCount,
  initialLastSyncAt,
}: {
  enabled: boolean
  initialStatus: string | null
  displayName: string | null
  username: string | null
  initialSelectedCount: number
  initialLastSyncAt: string | null
}) {
  const [status, setStatus] = useState(initialStatus)
  const [step, setStep] = useState<'idle' | 'phone' | 'code' | 'password'>(
    initialStatus === 'pending_code' ? 'code' : initialStatus === 'pending_password' ? 'password' : 'idle',
  )
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedCount, setSelectedCount] = useState(initialSelectedCount)
  const [lastSyncAt, setLastSyncAt] = useState(initialLastSyncAt)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const connected = status === 'connected'

  async function submit(endpoint: string, body: Record<string, string>) {
    setBusy(true)
    setMessage(null)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const data = response ? await response.json().catch(() => ({})) : {}
    setBusy(false)
    if (!response?.ok) {
      setMessage(data.error ?? 'Telegram account connection failed.')
      return null
    }
    return data
  }

  async function start() {
    const data = await submit('/api/integrations/telegram/account/start', { phoneNumber: phone })
    if (data) { setStatus(data.status); setStep('code'); setMessage('Telegram sent a login code.') }
  }

  async function verifyCode() {
    const data = await submit('/api/integrations/telegram/account/verify-code', { code })
    if (!data) return
    setStatus(data.status)
    if (data.status === 'pending_password') setStep('password')
    else { setStep('idle'); setPickerOpen(true) }
  }

  async function verifyPassword() {
    const data = await submit('/api/integrations/telegram/account/verify-password', { password })
    setPassword('')
    if (data) { setStatus('connected'); setStep('idle'); setPickerOpen(true) }
  }

  async function disconnect() {
    setBusy(true)
    const response = await fetch('/api/integrations/telegram/account/disconnect', { method: 'POST' }).catch(() => null)
    setBusy(false)
    if (response?.ok) {
      setStatus('disabled')
      setPickerOpen(false)
      setMessage('Telegram account disconnected. Existing knowledge was kept.')
    } else setMessage('Telegram account could not be disconnected.')
  }

  async function syncSelected() {
    if (!selectedCount) return
    setBusy(true)
    setMessage(null)
    const response = await fetch('/api/integrations/telegram/account/sync-selected', { method: 'POST' }).catch(() => null)
    const data = response ? await response.json().catch(() => ({})) : {}
    setBusy(false)
    if (!response?.ok) return setMessage(data.error ?? 'Selected Telegram chats could not be synced.')
    setLastSyncAt(data.lastSyncedAt ?? new Date().toISOString())
    setMessage(`Synced ${data.importedMessages ?? 0} messages from selected Telegram chats.`)
  }

  return (
    <>
      <section className="flex flex-col rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-ink">Telegram Account Sync</h4>
          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-indigo-700">{connected ? 'Connected' : 'Primary mode'}</span>
        </div>
        <p className="mt-1 text-sm text-muted">Connect your Telegram account, choose the channels/chats you want Neuron to read, and sync selected messages.</p>
        <p className="mt-3 text-xs text-muted">Telegram Account Sync lets Neuron read selected chats from your account. Only connect accounts you own or are authorized to connect.</p>
        {!enabled ? <p className="mt-4 rounded-lg bg-white p-3 text-xs text-muted">Account Sync is disabled until the server-side Telegram API credentials and encrypted session storage are configured.</p> : null}
        {connected ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink">Connected as {displayName || username || 'Telegram user'}</p>
            <p className="text-xs text-muted">{selectedCount} chats selected{lastSyncAt ? ` · Last synced ${new Date(lastSyncAt).toLocaleDateString()}` : ''}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPickerOpen(true)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">Manage chats</button>
              <button type="button" onClick={syncSelected} disabled={busy || !selectedCount} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-50">Sync selected</button>
              <button type="button" onClick={disconnect} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-muted">Disconnect</button>
            </div>
          </div>
        ) : enabled ? (
          <div className="mt-4 space-y-3">
            {step === 'idle' ? <button type="button" onClick={() => setStep('phone')} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">Connect Telegram account</button> : null}
            {step === 'phone' ? <><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+14155550123" aria-label="Telegram phone number" className="w-full rounded-lg border border-warm bg-white px-3 py-2 text-sm" /><button type="button" disabled={busy} onClick={start} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">Send login code</button></> : null}
            {step === 'code' ? <><p className="text-xs text-muted">Enter the code Telegram sent to your account.</p><input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" aria-label="Telegram login code" placeholder="Login code" className="w-full rounded-lg border border-warm bg-white px-3 py-2 text-sm" /><button type="button" disabled={busy} onClick={verifyCode} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">Verify code</button></> : null}
            {step === 'password' ? <><p className="text-xs text-muted">Your Telegram account has two-step verification enabled. Neuron never stores this password.</p><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} aria-label="Telegram 2FA password" placeholder="Telegram 2FA password" className="w-full rounded-lg border border-warm bg-white px-3 py-2 text-sm" /><button type="button" disabled={busy} onClick={verifyPassword} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">Verify 2FA password</button></> : null}
          </div>
        ) : null}
        {message ? <p aria-live="polite" className="mt-3 text-xs text-muted">{message}</p> : null}
      </section>
      {connected && pickerOpen ? <div className="lg:col-span-2"><TelegramAccountChatPicker onClose={() => setPickerOpen(false)} onSelectionSaved={setSelectedCount} onSyncSuccess={setLastSyncAt} /></div> : null}
    </>
  )
}
