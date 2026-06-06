'use client'

import { useState } from 'react'
import { clsx } from 'clsx'

interface AlertRecord {
  id: string
  type: string
  title: string
  description: string
  sourceChunkIds: string[]
  status: string
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

interface Props {
  alerts: AlertRecord[]
  memberMap: Record<string, string>
  currentUserId: string
}

type Filter = 'unread' | 'all' | 'resolved'

const TYPE_STYLES: Record<string, string> = {
  conflict: 'bg-red-100 text-red-700',
  stale: 'bg-amber-100 text-amber-700',
  important: 'bg-blue-100 text-blue-700',
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function AlertsClient({ alerts: initialAlerts, memberMap, currentUserId }: Props) {
  const [alerts, setAlerts] = useState(initialAlerts)
  const [filter, setFilter] = useState<Filter>('unread')
  const [resolving, setResolving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = alerts.filter((a) => {
    if (filter === 'unread') return a.status !== 'resolved'
    if (filter === 'resolved') return a.status === 'resolved'
    return true
  })

  async function handleResolve(alertId: string) {
    setResolving(alertId)
    setError(null)
    try {
      const res = await fetch(`/api/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      })
      if (!res.ok) throw new Error('Failed to resolve')
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, status: 'resolved', resolvedBy: currentUserId, resolvedAt: new Date().toISOString() }
            : a,
        ),
      )
    } catch {
      setError('Failed to resolve alert')
    } finally {
      setResolving(null)
    }
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'unread', label: 'Unread' },
    { key: 'all', label: 'All' },
    { key: 'resolved', label: 'Resolved' },
  ]

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="flex gap-2">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              'px-3 py-1 text-xs rounded-full font-medium transition-colors',
              filter === key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          {filter === 'unread' ? 'No unresolved alerts — all clear.' : 'No alerts in this view.'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((alert) => (
          <div key={alert.id} className={clsx('bg-white rounded-lg border p-4', alert.status === 'resolved' ? 'border-gray-100 opacity-60' : 'border-gray-200')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={clsx('px-2 py-0.5 text-xs rounded font-medium', TYPE_STYLES[alert.type] ?? 'bg-gray-100 text-gray-600')}>
                    {alert.type}
                  </span>
                  <span className="text-xs text-gray-400">{timeAgo(alert.createdAt)}</span>
                </div>
                <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{alert.description}</p>
                {alert.status === 'resolved' && alert.resolvedBy && (
                  <p className="text-xs text-gray-400 mt-1">
                    Resolved by {memberMap[alert.resolvedBy] ?? alert.resolvedBy}
                  </p>
                )}
              </div>
              {alert.status !== 'resolved' && (
                <button
                  onClick={() => handleResolve(alert.id)}
                  disabled={resolving === alert.id}
                  className="shrink-0 text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  {resolving === alert.id ? 'Resolving…' : 'Resolve'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
