'use client'

import { useEffect, useMemo, useState } from 'react'

export type SlackPickerConversation = {
  id: string
  name: string
  type: 'public_channel' | 'private_channel' | 'im' | 'mpim'
  isPrivate: boolean
  isDm: boolean
  isGroupDm: boolean
  selected: boolean
  syncEnabled: boolean
  visibility: 'personal' | 'team'
  lastSyncedAt: string | null
  lastMessageAt: string | null
}

const filters = [
  ['all', 'All'],
  ['public_channel', 'Public channels'],
  ['private_channel', 'Private channels'],
  ['mpim', 'Group DMs'],
  ['im', 'DMs'],
] as const

function badge(type: SlackPickerConversation['type']) {
  if (type === 'public_channel') return 'Public'
  if (type === 'private_channel') return 'Private'
  if (type === 'mpim') return 'Group DM'
  return 'DM'
}

function displayName(item: SlackPickerConversation) {
  return item.type === 'public_channel' || item.type === 'private_channel' ? `#${item.name}` : item.name
}

export default function SlackChannelPicker({
  connected,
  onSelectionSaved,
  onClose,
  onSyncSuccess,
}: {
  connected: boolean
  onSelectionSaved?: (count: number) => void
  onClose?: () => void
  onSyncSuccess?: (syncedAt: string) => void
}) {
  const [items, setItems] = useState<SlackPickerConversation[]>([])
  const [filter, setFilter] = useState<(typeof filters)[number][0]>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(connected)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [requiresAdmin, setRequiresAdmin] = useState(false)

  useEffect(() => {
    if (!connected) return
    let live = true
    fetch('/api/integrations/slack/conversations?mode=user')
      .then(async (response) => {
        const body = await response.json()
        if (!live) return
        setRequiresAdmin(Boolean(body.requiresAdminApproval))
        setMessage(response.ok ? null : body.error ?? 'Slack conversations could not be loaded.')
        setItems(Array.isArray(body.conversations) ? body.conversations : [])
      })
      .catch(() => live && setMessage('Slack conversations could not be loaded.'))
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [connected])

  const visible = useMemo(() => items.filter((item) =>
    (filter === 'all' || item.type === filter)
    && item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [filter, items, search])
  const selectedCount = items.filter((item) => item.selected && item.syncEnabled).length
  const privateTeamWarning = items.some((item) => item.type !== 'public_channel' && item.selected && item.visibility === 'team')

  function update(id: string, patch: Partial<SlackPickerConversation>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  function selectVisible(selected: boolean) {
    const ids = new Set(visible.map((item) => item.id))
    setItems((current) => current.map((item) => ids.has(item.id)
      ? { ...item, selected, syncEnabled: selected }
      : item))
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    const response = await fetch('/api/integrations/slack/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversations: items.map(({ id, selected, syncEnabled, visibility }) => ({
          id, selected, syncEnabled, visibility,
        })),
      }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => ({})) : {}
    setSaving(false)
    if (!response?.ok) return setMessage(body.error ?? 'Could not save your Slack selection.')
    setMessage('Selection saved.')
    onSelectionSaved?.(selectedCount)
  }

  async function sync() {
    if (selectedCount === 0) return setMessage('Choose Slack conversations before syncing.')
    setSaving(true)
    const response = await fetch('/api/integrations/slack/sync-selected', { method: 'POST' }).catch(() => null)
    const body = response ? await response.json().catch(() => ({})) : {}
    setSaving(false)
    if (response?.ok) {
      const syncedAt = new Date().toISOString()
      setItems((current) => current.map((item) =>
        item.selected && item.syncEnabled ? { ...item, lastSyncedAt: syncedAt } : item))
      setMessage('Synced selected Slack conversations.')
      onSyncSuccess?.(syncedAt)
    } else {
      setMessage(body.error ?? 'Could not sync selected Slack conversations.')
    }
  }

  if (!connected) return <p className="text-sm text-muted">Connect your Slack account first.</p>

  return (
    <div className="space-y-4 rounded-xl border border-indigo-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-ink">Choose Slack channels to sync</h4>
          <p className="mt-1 text-sm text-muted">Neuron will only read the conversations you select. Private channels and DMs stay personal by default.</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-medium text-muted hover:text-ink">Hide</button>
      </div>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search conversations"
        aria-label="Search Slack conversations"
        className="w-full rounded-lg border border-warm bg-cream px-3 py-2 text-sm text-ink"
      />
      <div className="flex flex-wrap gap-1" aria-label="Conversation filters">
        {filters.map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-xs ${filter === value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-muted'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-ink">{selectedCount} selected</span>
        <div className="flex gap-3">
          <button type="button" onClick={() => selectVisible(true)} className="text-indigo-600">Select all visible</button>
          <button type="button" onClick={() => selectVisible(false)} className="text-muted">Clear selected</button>
        </div>
      </div>
      {loading ? <p className="text-sm text-muted">Loading Slack conversations…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="rounded-lg bg-cream p-3 text-sm text-muted">
          {requiresAdmin
            ? 'Your Slack workspace requires admin approval or additional scopes before conversations can be listed.'
            : 'No Slack conversations found. Your workspace may require admin approval or additional scopes.'}
        </p>
      ) : null}
      <div data-testid="slack-conversation-list" className="max-h-[420px] space-y-2 overflow-y-auto overscroll-contain pr-1">
        {visible.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-warm/70 p-3">
            <input
              type="checkbox"
              aria-label={`Select ${item.name}`}
              checked={item.selected}
              onChange={(event) => update(item.id, { selected: event.target.checked, syncEnabled: event.target.checked })}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{displayName(item)}</p>
              <p className="text-xs text-muted">{item.lastSyncedAt ? `Last synced ${new Date(item.lastSyncedAt).toLocaleDateString()}` : 'Not synced yet'}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-muted">{badge(item.type)}</span>
            <select
              aria-label={`Visibility for ${item.name}`}
              value={item.visibility}
              onChange={(event) => update(item.id, { visibility: event.target.value as 'personal' | 'team' })}
              className="rounded-md border border-warm bg-white px-2 py-1 text-xs"
            >
              <option value="personal">Personal</option>
              <option value="team">Team</option>
            </select>
          </div>
        ))}
      </div>
      {privateTeamWarning ? (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          This may share private conversation context with the workspace brain.
        </p>
      ) : null}
      {selectedCount === 0 ? (
        <p className="text-xs text-muted">Choose at least one conversation before syncing.</p>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t border-warm/70 pt-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Save selection</button>
        <button type="button" onClick={sync} disabled={saving || selectedCount === 0} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-50">Sync selected now</button>
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-gray-100 hover:text-ink">Done</button>
      </div>
      {message ? <p aria-live="polite" className="text-xs text-muted">{message}</p> : null}
    </div>
  )
}
