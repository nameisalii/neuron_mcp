'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx } from 'clsx'

interface Member {
  userId: string
  displayName: string
}

interface ActivityEvent {
  id: string
  userId: string
  displayName: string
  eventType: string
  description: string
  createdAt: string
}

interface ApiResponse {
  success: boolean
  data: ActivityEvent[]
  meta: { total: number; page: number; limit: number }
}

const EVENT_LABELS: Record<string, { label: string; dot: string }> = {
  sync:               { label: 'Sync',       dot: 'bg-blue-400' },
  label:              { label: 'Label',      dot: 'bg-purple-400' },
  query:              { label: 'Query',      dot: 'bg-amber-400' },
  invite:             { label: 'Invite',     dot: 'bg-emerald-400' },
  join:               { label: 'Join',       dot: 'bg-emerald-400' },
  settings_change:    { label: 'Settings',   dot: 'bg-gray-400' },
  conflict_detected:  { label: 'Conflict',   dot: 'bg-red-400' },
  page_viewed:        { label: 'View',       dot: 'bg-gray-300' },
}

const EVENT_FILTERS = [
  { value: '', label: 'All' },
  { value: 'sync', label: 'Syncs' },
  { value: 'label', label: 'Labels' },
  { value: 'query', label: 'Queries' },
  { value: 'invite', label: 'Team' },
  { value: 'conflict_detected', label: 'Conflicts' },
]

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

interface Props {
  workspaceId: string
  workspaceType: string
  members: Member[]
  currentUserId: string
}

export default function ActivityFeedClient({ workspaceType, members, currentUserId }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filterType, setFilterType] = useState('')
  const [filterUser, setFilterUser] = useState('')

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' })
      if (filterType) params.set('eventType', filterType)
      if (filterUser) params.set('userId', filterUser)
      const res = await fetch(`/api/activity?${params}`)
      const data = await res.json() as ApiResponse
      setEvents(data.data ?? [])
      setTotalPages(Math.ceil((data.meta?.total ?? 0) / 30) || 1)
    } catch {
      // non-fatal — show empty state
    } finally {
      setLoading(false)
    }
  }, [page, filterType, filterUser])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useEffect(() => { setPage(1) }, [filterType, filterUser])

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {workspaceType === 'solo' ? 'Your Activity' : 'Team Activity'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Everything happening in your brain</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {EVENT_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilterType(f.value)}
              className={clsx(
                'px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
                filterType === f.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {workspaceType === 'team' && members.length > 1 && (
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All members</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}{m.userId === currentUserId ? ' (you)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-gray-200 mt-2 shrink-0" />
              <div className="flex-1 space-y-1.5 py-0.5">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-50 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">No activity yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Sync some Notion pages or ask a question to get started
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          <AnimatePresence initial={false}>
            {events.map((event, i) => {
              const meta = EVENT_LABELS[event.eventType] ?? { label: event.eventType, dot: 'bg-gray-300' }
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02, duration: 0.2 }}
                  className="flex gap-3 px-3 py-3 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-start pt-1.5 shrink-0">
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">{event.displayName}</span>
                      {' '}
                      <span className="text-gray-600">{event.description}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(event.createdAt)}</p>
                  </div>
                  <span className="text-xs text-gray-300 group-hover:text-gray-400 shrink-0 self-center transition-colors">
                    {meta.label}
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
