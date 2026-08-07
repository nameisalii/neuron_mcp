'use client'

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { clsx } from 'clsx'

export interface DecisionRow {
  id: string
  title: string
  decision: string
  reason: string | null
  alternatives: string | null
  source: string
  madeBy: string | null
  madeAt: string | null
  createdAt: string
}

const TIME_FILTERS = [
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
  { label: 'All time', value: 'all' },
]

function filterByTime(decisions: DecisionRow[], filter: string): DecisionRow[] {
  if (filter === 'all') return decisions
  const cutoff = new Date()
  if (filter === 'week') cutoff.setDate(cutoff.getDate() - 7)
  else if (filter === 'month') cutoff.setMonth(cutoff.getMonth() - 1)
  return decisions.filter((d) => new Date(d.createdAt) >= cutoff)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface DecisionTimelineProps {
  decisions: DecisionRow[]
}

export default function DecisionTimeline({ decisions }: DecisionTimelineProps) {
  const [timeFilter, setTimeFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [reasonDraft, setReasonDraft] = useState('')
  const [savedReasons, setSavedReasons] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const visible = filterByTime(decisions, timeFilter).filter(decision => !normalizedSearch || [
    decision.title, decision.decision, decision.reason, decision.alternatives, decision.source, decision.madeBy,
  ].filter(Boolean).some(value => String(value).toLocaleLowerCase().includes(normalizedSearch)))

  async function handleSaveReason(id: string) {
    if (!reasonDraft.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/decisions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reasonDraft.trim() }),
      })
      if (res.ok) {
        setSavedReasons((prev) => ({ ...prev, [id]: reasonDraft.trim() }))
        setEditingId(null)
        setReasonDraft('')
      } else {
        setSaveError('Could not save reason. Please try again.')
      }
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input aria-label="Search decisions" type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search decisions, reasons, people, or sources" className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-10 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
        {searchQuery && <button type="button" aria-label="Clear decision search" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="h-4 w-4" /></button>}
      </div>
      <div className="flex gap-1">
        {TIME_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setTimeFilter(f.value)}
            className={clsx(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              timeFilter === f.value
                ? 'bg-brand-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card padding="lg" className="text-center text-gray-500 text-sm">
          {decisions.length === 0
            ? 'No decisions yet. Neuron will surface important decisions from synced conversations, or you can add one manually.'
            : normalizedSearch ? 'No decisions match your search.' : 'No decisions in this time range.'}
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
          <div className="space-y-6">
            {visible.map((d) => {
              const reason = savedReasons[d.id] ?? d.reason
              const isEditing = editingId === d.id
              const altTags = d.alternatives
                ? d.alternatives.split(',').map((s) => s.trim()).filter(Boolean)
                : []

              return (
                <div key={d.id} className="relative pl-10">
                  <div className="absolute left-2.5 top-5 w-3 h-3 rounded-full bg-brand-600 border-2 border-white ring-2 ring-brand-200" />
                  <Card padding="md">
                    <div className="mb-2">
                      <h3 className="font-serif text-lg font-semibold text-gray-900 leading-snug">
                        {d.title}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {d.source} · {formatDate(d.createdAt)}
                        {d.madeBy && ` · ${d.madeBy}`}
                      </p>
                    </div>

                    <p className="text-sm text-gray-800">{d.decision}</p>

                    {reason && (
                      <p className="text-xs text-gray-500 mt-3 italic">Why: {reason}</p>
                    )}

                    {altTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {altTags.map((alt) => (
                          <span
                            key={alt}
                            className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600"
                          >
                            {alt}
                          </span>
                        ))}
                      </div>
                    )}

                    {!reason && !isEditing && (
                      <button
                        onClick={() => {
                          setEditingId(d.id)
                          setReasonDraft('')
                        }}
                        className="mt-3 text-xs text-brand-600 hover:text-brand-700 font-medium"
                      >
                        + Add reason
                      </button>
                    )}

                    {isEditing && (
                      <div className="mt-3 space-y-2">
                        {saveError && (
                          <p className="text-xs text-red-600">{saveError}</p>
                        )}
                        <textarea
                          value={reasonDraft}
                          onChange={(e) => setReasonDraft(e.target.value)}
                          placeholder="Why was this decision made?"
                          rows={2}
                          className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveReason(d.id)}
                            disabled={saving || !reasonDraft.trim()}
                            className="px-3 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null)
                              setReasonDraft('')
                            }}
                            className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
