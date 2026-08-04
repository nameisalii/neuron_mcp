'use client'

import { BookOpen, GitBranch, Plug, Scale } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KnowledgeDisplayCategory } from '@/lib/knowledge/display'
import KnowledgeGrid, { type KnowledgeGridItem } from './KnowledgeGrid'

type KnowledgeTypeFilter = 'all' | KnowledgeDisplayCategory

export default function KnowledgePageClient({
  counts,
  items,
  initialType,
}: {
  counts: { total: number; rules: number; decisions: number; integrations: number }
  items: KnowledgeGridItem[]
  initialType: KnowledgeTypeFilter
}) {
  const [activeType, setActiveType] = useState<KnowledgeTypeFilter>(initialType)
  // Items and summary counts render on the server. Retagging happens on the
  // client, so both are mirrored here to update the moment a type changes.
  const [liveItems, setLiveItems] = useState(items)
  const liveItemsRef = useRef(items)
  const [countDelta, setCountDelta] = useState({ rules: 0, decisions: 0 })

  useEffect(() => {
    liveItemsRef.current = items
    setLiveItems(items)
    setCountDelta({ rules: 0, decisions: 0 })
  }, [items])

  // A delta, not a recount: `items` is capped at 100 while `counts` covers the
  // whole workspace, so recomputing from `items` would understate large workspaces.
  function handleItemCategoryChange(itemId: string, next: KnowledgeDisplayCategory) {
    const previous = liveItemsRef.current.find(item => item.id === itemId)?.category
    if (!previous || previous === next) return

    const updated = liveItemsRef.current.map(item => (
      item.id === itemId ? { ...item, category: next } : item
    ))
    // Keep the ref synchronous so an immediate rollback after a failed request
    // observes the optimistic category instead of a stale render closure.
    liveItemsRef.current = updated
    setLiveItems(updated)
    setCountDelta(current => ({
      rules: current.rules + (next === 'rules' ? 1 : 0) - (previous === 'rules' ? 1 : 0),
      decisions: current.decisions + (next === 'decisions' ? 1 : 0) - (previous === 'decisions' ? 1 : 0),
    }))
  }

  const cards = [
    { label: 'Total knowledge', value: counts.total, note: 'Saved context', icon: BookOpen },
    { label: 'Rules', value: counts.rules + countDelta.rules, note: 'Operating rules', icon: Scale },
    { label: 'Decisions', value: counts.decisions + countDelta.decisions, note: 'Remembered decisions', icon: GitBranch },
    { label: 'Integrations', value: counts.integrations, note: 'Connected context', icon: Plug },
  ]

  return (
    <div className="w-full space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-950">Knowledge</h1>
        <p className="mt-1 text-sm text-gray-500">Saved context from your integrations and workspace.</p>
      </header>

      <section aria-label="Knowledge overview" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, note, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <span className="inline-flex rounded-xl bg-gray-50 p-2 text-gray-600"><Icon className="h-5 w-5" /></span>
            <p className="mt-3 text-2xl font-semibold text-gray-950">{value}</p>
            <p className="mt-1 text-sm font-medium text-gray-800">{label}</p>
            <p className="text-xs text-gray-500">{note}</p>
          </div>
        ))}
      </section>

      <KnowledgeGrid
        items={liveItems}
        activeType={activeType}
        onTypeChange={setActiveType}
        onItemCategoryChange={handleItemCategoryChange}
      />
    </div>
  )
}
