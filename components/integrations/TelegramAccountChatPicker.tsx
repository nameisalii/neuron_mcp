'use client'

import { useEffect, useMemo, useState } from 'react'

type TelegramChat = {
  id: string
  chatId: string
  title: string
  username: string | null
  chatType: 'channel' | 'group' | 'supergroup' | 'private'
  selected: boolean
  syncEnabled: boolean
  visibility: 'personal' | 'team'
  lastSyncedAt: string | null
  lastMessageAt: string | null
  status: string
}

const filters = [
  ['all', 'All'],
  ['channel', 'Channels'],
  ['groups', 'Groups'],
  ['private', 'Private'],
] as const

export default function TelegramAccountChatPicker({
  onClose,
  onSelectionSaved,
  onSyncSuccess,
}: {
  onClose: () => void
  onSelectionSaved?: (count: number) => void
  onSyncSuccess?: (date: string) => void
}) {
  const [items, setItems] = useState<TelegramChat[]>([])
  const [filter, setFilter] = useState<(typeof filters)[number][0]>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/integrations/telegram/account/chats')
      .then(async (response) => {
        const body = await response.json()
        if (!active) return
        setItems(Array.isArray(body.chats) ? body.chats : [])
        if (!response.ok) setMessage(body.error ?? 'Telegram chats could not be loaded.')
      })
      .catch(() => active && setMessage('Telegram chats could not be loaded.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const visible = useMemo(() => items.filter((item) => {
    const typeMatches = filter === 'all'
      || item.chatType === filter
      || (filter === 'groups' && (item.chatType === 'group' || item.chatType === 'supergroup'))
    return typeMatches && item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  }), [filter, items, search])
  const selectedCount = items.filter((item) => item.selected && item.syncEnabled).length
  const privateTeamWarning = items.some((item) => item.chatType === 'private' && item.selected && item.visibility === 'team')

  function update(chatId: string, patch: Partial<TelegramChat>) {
    setItems((current) => current.map((item) => item.chatId === chatId ? { ...item, ...patch } : item))
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    const response = await fetch('/api/integrations/telegram/account/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chats: items.map(({ chatId, selected, syncEnabled, visibility }) => ({ chatId, selected, syncEnabled, visibility })) }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => ({})) : {}
    setBusy(false)
    if (!response?.ok) return setMessage(body.error ?? 'Could not save Telegram chat selection.')
    setMessage('Selection saved.')
    onSelectionSaved?.(selectedCount)
  }

  async function sync() {
    if (!selectedCount) return setMessage('Choose at least one Telegram chat before syncing.')
    setBusy(true)
    const response = await fetch('/api/integrations/telegram/account/sync-selected', { method: 'POST' }).catch(() => null)
    const body = response ? await response.json().catch(() => ({})) : {}
    setBusy(false)
    if (!response?.ok) return setMessage(body.error ?? 'Selected Telegram chats could not be synced.')
    const date = body.lastSyncedAt ?? new Date().toISOString()
    setMessage(`Synced ${body.importedMessages ?? 0} messages from selected Telegram chats.`)
    onSyncSuccess?.(date)
  }

  return (
    <div className="mt-5 space-y-4 rounded-xl border border-indigo-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-ink">Choose Telegram chats to sync</h4>
          <p className="mt-1 text-sm text-muted">Neuron will only sync Telegram chats you select. Private chats default to personal memory.</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-medium text-muted hover:text-ink">Hide</button>
      </div>
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search Telegram chats" placeholder="Search chats" className="w-full rounded-lg border border-warm bg-cream px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-1" aria-label="Telegram chat filters">
        {filters.map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs ${filter === value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-muted'}`}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-ink">{selectedCount} selected</span>
        <div className="flex gap-3">
          <button type="button" onClick={() => {
            const ids = new Set(visible.map((item) => item.chatId))
            setItems((current) => current.map((item) => ids.has(item.chatId) ? { ...item, selected: true, syncEnabled: true } : item))
          }} className="text-indigo-600">Select all visible</button>
          <button type="button" onClick={() => setItems((current) => current.map((item) => ({ ...item, selected: false, syncEnabled: false })))} className="text-muted">Clear selected</button>
        </div>
      </div>
      {loading ? <p className="text-sm text-muted">Loading Telegram chats…</p> : null}
      {!loading && !items.length ? <p className="rounded-lg bg-cream p-3 text-sm text-muted">No Telegram chats found. Reconnect the account if the session expired.</p> : null}
      <div data-testid="telegram-chat-list" className="max-h-[420px] space-y-2 overflow-y-auto overscroll-contain pr-1">
        {visible.map((item) => (
          <div key={item.chatId} className="flex flex-wrap items-center gap-3 rounded-lg border border-warm/70 p-3">
            <input type="checkbox" aria-label={`Select ${item.title}`} checked={item.selected} onChange={(event) => update(item.chatId, { selected: event.target.checked, syncEnabled: event.target.checked })} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{item.title}</p>
              <p className="text-xs text-muted">{item.lastSyncedAt ? `Last synced ${new Date(item.lastSyncedAt).toLocaleDateString()}` : 'Not synced yet'}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] capitalize text-muted">{item.chatType}</span>
            <select aria-label={`Visibility for ${item.title}`} value={item.visibility} onChange={(event) => update(item.chatId, { visibility: event.target.value as 'personal' | 'team' })} className="rounded-md border border-warm bg-white px-2 py-1 text-xs">
              <option value="personal">Personal</option>
              <option value="team">Team</option>
            </select>
          </div>
        ))}
      </div>
      {privateTeamWarning ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Use Team only when you want selected private Telegram context shared with the workspace.</p> : null}
      {!selectedCount ? <p className="text-xs text-muted">Choose at least one Telegram chat before syncing.</p> : null}
      <div className="flex flex-wrap gap-2 border-t border-warm/70 pt-3">
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Save selection</button>
        <button type="button" onClick={sync} disabled={busy || !selectedCount} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-50">Sync selected messages</button>
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-gray-100">Done</button>
      </div>
      {message ? <p aria-live="polite" className="text-xs text-muted">{message}</p> : null}
    </div>
  )
}
