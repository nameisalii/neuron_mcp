'use client'

import { useState } from 'react'
import { CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { clsx } from 'clsx'

export interface KnowledgeItemRow {
  id: string
  content: string
  category: string
  source: string
  confidence: number
  verified: boolean
  verifiedAt: string | null
  frozen: boolean
  conflictNote: string | null
  createdAt: string
}

const CATEGORY_COLORS: Record<string, string> = {
  rule: 'bg-blue-100 text-blue-700',
  decision: 'bg-purple-100 text-purple-700',
  process: 'bg-amber-100 text-amber-700',
  idea: 'bg-emerald-100 text-emerald-700',
  fact: 'bg-sky-100 text-sky-700',
}

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Rules', value: 'rule' },
  { label: 'Decisions', value: 'decision' },
  { label: 'Processes', value: 'process' },
  { label: 'Ideas', value: 'idea' },
  { label: 'Facts', value: 'fact' },
]

interface BrainGridProps {
  items: KnowledgeItemRow[]
}

export default function BrainGrid({ items }: BrainGridProps) {
  const [activeFilter, setActiveFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set())
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set())
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const filtered = items.filter((item) => {
    const matchesFilter = activeFilter === 'all' || item.category === activeFilter
    const matchesSearch =
      !search || item.content.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  async function handleVerify(id: string) {
    setVerifyingIds((prev) => new Set([...prev, id]))
    setVerifyError(null)
    try {
      const res = await fetch('/api/knowledge/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setVerifiedIds((prev) => new Set([...prev, id]))
      } else {
        setVerifyError('Could not verify this item. Please try again.')
      }
    } catch {
      setVerifyError('Network error. Please try again.')
    } finally {
      setVerifyingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeFilter === f.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search knowledge…"
          className="flex-1 px-3 py-1.5 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      {verifyError && (
        <p className="text-xs text-red-600 px-1">{verifyError}</p>
      )}

      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center text-gray-500 text-sm">
          {items.length === 0
            ? 'No knowledge items yet. Connect Slack and run a sync.'
            : 'No items match your filter.'}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => {
            const isVerified = item.verified || verifiedIds.has(item.id)
            const isVerifying = verifyingIds.has(item.id)

            return (
              <Card key={item.id} padding="sm" className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={clsx(
                      'inline-flex px-2 py-0.5 rounded text-xs font-medium shrink-0',
                      CATEGORY_COLORS[item.category] ?? 'bg-gray-100 text-gray-700'
                    )}
                  >
                    {item.category}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.frozen && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                        <AlertTriangle className="w-3 h-3" />
                        Conflict
                      </span>
                    )}
                    {isVerified && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle className="w-3 h-3" />
                        Verified
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-800 flex-1">{item.content}</p>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{item.source}</span>
                    <span>·</span>
                    <span>{Math.round(item.confidence * 100)}% confidence</span>
                  </div>
                  {!isVerified && !item.frozen && (
                    <button
                      onClick={() => handleVerify(item.id)}
                      disabled={isVerifying}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 transition-colors"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      {isVerifying ? 'Verifying…' : 'Verify'}
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">
        {filtered.length} of {items.length} items
      </p>
    </div>
  )
}
