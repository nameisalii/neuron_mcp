'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import KnowledgeCard from '@/components/KnowledgeCard'
import { clsx } from 'clsx'

export interface KnowledgeItemRow {
  id: string
  content: string
  category: string
  aiSuggestedCategory?: string | null
  typeOverriddenByUser?: boolean | null
  source: string
  confidence: number
  verified: boolean
  verifiedAt: string | null
  frozen: boolean
  conflictNote: string | null
  createdAt: string
  sourceUrl?: string | null
  sourceExternalId?: string | null
  owner?: string | null
  sourceCreatedAt?: string | null
  updatedAt?: string | null
  notionPageTitle?: string | null
}

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Rules', value: 'rules', category: 'rule' },
  { label: 'Decisions', value: 'decisions', category: 'decision' },
  { label: 'Processes', value: 'processes', category: 'process' },
  { label: 'Ideas', value: 'ideas', category: 'idea' },
  { label: 'Facts', value: 'facts', category: 'fact' },
]

interface BrainGridProps {
  items: KnowledgeItemRow[]
  activeFilter?: string
  onCategoryChange?: (id: string, nextCategory: string) => void
}

export default function BrainGrid({ items, activeFilter = 'all', onCategoryChange }: BrainGridProps) {
  const [localItems, setLocalItems] = useState(items)
  const [search, setSearch] = useState('')
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set())
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set())
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const router = useRouter()
  const activeCategory = FILTERS.find((filter) => filter.value === activeFilter)?.category
  const displayItems = dedupeLinearItems(localItems)
  const filtered = displayItems.filter((item) => {
    const matchesFilter = !activeCategory || item.category === activeCategory
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

  function handleCategoryChange(id: string, nextCategory: string) {
    setLocalItems((prev) => prev.map((item) => (
      item.id === id
        ? { ...item, category: nextCategory, typeOverriddenByUser: true }
        : item
    )))
    onCategoryChange?.(id, nextCategory)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => router.push(`/dashboard/overview?filter=${f.value}`)}
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
          {localItems.length === 0
            ? 'No knowledge items yet. Connect Slack and run a sync.'
            : 'No items match your filter.'}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => {
            const isVerified = item.verified || verifiedIds.has(item.id)
            const isVerifying = verifyingIds.has(item.id)

            return (
              <KnowledgeCard
                key={item.id}
                item={{
                  ...item,
                  title: item.notionPageTitle,
                  updatedAt: item.updatedAt ?? item.createdAt,
                }}
                footer={
                  <div className="flex items-center gap-1.5">
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
                }
                onCategoryChange={handleCategoryChange}
              />
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">
        {filtered.length} of {displayItems.length} items
      </p>
    </div>
  )
}

function dedupeLinearItems(items: KnowledgeItemRow[]): KnowledgeItemRow[] {
  const grouped = new Map<string, KnowledgeItemRow>()
  for (const item of items) {
    const key = item.source === 'linear' && (item.sourceExternalId || item.sourceUrl)
      ? `linear:${item.sourceExternalId ?? item.sourceUrl}`
      : `${item.source}:${item.id}`
    const existing = grouped.get(key)
    if (!existing || linearCardQuality(item) > linearCardQuality(existing)) grouped.set(key, item)
  }
  return [...grouped.values()]
}

function linearCardQuality(item: KnowledgeItemRow): number {
  return Number(/^Linear issue\s+[^:]+:/i.test(item.content)) * 10 + item.content.length / 10000
}
