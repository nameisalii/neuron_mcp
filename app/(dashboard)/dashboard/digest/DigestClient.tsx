'use client'

import { useState } from 'react'
import { clsx } from 'clsx'

interface DigestRecord {
  id: string
  type: string
  date: string
  content: unknown
  readAt: string | null
  createdAt: string
}

interface DigestContent {
  summary?: string
  highlights?: Array<{ type: string; text: string }>
  stats?: { synced: number; labeled: number; queries: number; alerts: number }
}

interface Props {
  digests: DigestRecord[]
  unreadAlerts: number
}

type Filter = 'all' | 'daily' | 'weekly' | 'unread'

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function DigestClient({ digests, unreadAlerts }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [readIds, setReadIds] = useState<Set<string>>(
    new Set(digests.filter((d) => d.readAt).map((d) => d.id)),
  )

  const filtered = digests.filter((d) => {
    if (filter === 'daily') return d.type === 'daily'
    if (filter === 'weekly') return d.type === 'weekly'
    if (filter === 'unread') return !readIds.has(d.id)
    return true
  })

  async function handleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id))
    if (!readIds.has(id)) {
      try {
        await fetch(`/api/digest/${id}/read`, { method: 'PATCH' })
        setReadIds((prev) => new Set([...prev, id]))
      } catch { /* fire-and-forget */ }
    }
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'unread', label: 'Unread' },
  ]

  return (
    <div className="space-y-4">
      {unreadAlerts > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          {unreadAlerts} unresolved alert{unreadAlerts === 1 ? '' : 's'} — <a href="/dashboard/alerts" className="underline font-medium">view alerts</a>
        </div>
      )}

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
          {filter === 'unread'
            ? 'All caught up — no unread digests.'
            : 'Your first digest will arrive tomorrow morning.'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((d) => {
          const content = d.content as DigestContent
          const isRead = readIds.has(d.id)
          const isOpen = expanded === d.id
          return (
            <div key={d.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => handleExpand(d.id)}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {!isRead && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
                  <span className={clsx('px-2 py-0.5 text-xs rounded font-medium', d.type === 'weekly' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                    {d.type}
                  </span>
                  <p className="text-sm text-gray-700 truncate">{content.summary?.slice(0, 80) ?? 'Digest'}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{timeAgo(d.createdAt)}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  <p className="text-sm text-gray-700 leading-relaxed">{content.summary}</p>
                  {content.stats && (
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Captured', value: content.stats.synced },
                        { label: 'Updated', value: content.stats.labeled },
                        { label: 'Queries', value: content.stats.queries },
                        { label: 'Alerts', value: content.stats.alerts },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-gray-900">{value}</p>
                          <p className="text-xs text-gray-500">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {content.highlights && content.highlights.length > 0 && (
                    <ul className="space-y-1">
                      {content.highlights.map((h, i) => (
                        <li key={i} className="text-sm text-gray-600 flex gap-2">
                          <span className="text-gray-400">·</span>{h.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
