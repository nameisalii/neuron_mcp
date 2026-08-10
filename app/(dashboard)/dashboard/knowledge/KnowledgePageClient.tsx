'use client'

import dynamic from 'next/dynamic'
import { BookOpen, Boxes, GitBranch, List, Loader2, Plug, Scale } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KnowledgeDisplayCategory } from '@/lib/knowledge/display'
import type { KnowledgeGraphData } from '@/lib/knowledge/graph'
import KnowledgeGrid, { type KnowledgeGridItem } from './KnowledgeGrid'

const KnowledgeSphereView = dynamic(() => import('@/components/knowledge/KnowledgeSphereView'), { ssr: false })

type KnowledgeTypeFilter = 'all' | KnowledgeDisplayCategory

export default function KnowledgePageClient({
  counts,
  items,
  initialType,
  initialSource = '',
  initialSearch = '',
}: {
  counts: { total: number; rules: number; decisions: number; integrations: number }
  items: KnowledgeGridItem[]
  initialType: KnowledgeTypeFilter
  initialSource?: string
  initialSearch?: string
}) {
  const [activeType, setActiveType] = useState<KnowledgeTypeFilter>(initialType)
  // Items and summary counts render on the server. Retagging happens on the
  // client, so both are mirrored here to update the moment a type changes.
  const [liveItems, setLiveItems] = useState(items)
  const liveItemsRef = useRef(items)
  const [countDelta, setCountDelta] = useState({ rules: 0, decisions: 0 })
  const [view, setView] = useState<'list' | 'sphere'>('list')
  const [graph, setGraph] = useState<KnowledgeGraphData | null>(null)
  const [graphError, setGraphError] = useState('')
  const [graphLoading, setGraphLoading] = useState(false)

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

  async function showSphere() {
    setView('sphere')
    if (graph || graphLoading) return
    setGraphLoading(true)
    setGraphError('')
    try {
      const response = await fetch('/api/knowledge/graph')
      if (!response.ok) throw new Error('Could not load the knowledge map.')
      setGraph(await response.json() as KnowledgeGraphData)
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : 'Could not load the knowledge map.')
    } finally {
      setGraphLoading(false)
    }
  }

  return (
    <div className="w-full space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight text-gray-950">Knowledge</h1>
        <p className="mt-1 text-sm text-gray-500">Saved context from your integrations and workspace.</p></div>
        <div aria-label="Knowledge view" className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} className={view === 'list' ? 'inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white' : 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-600'}><List className="h-4 w-4" />List</button>
          <button type="button" aria-pressed={view === 'sphere'} onClick={() => void showSphere()} className={view === 'sphere' ? 'inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white' : 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-600'}><Boxes className="h-4 w-4" />3D View</button>
        </div>
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

      {view === 'list' ? <KnowledgeGrid
        items={liveItems}
        activeType={activeType}
        onTypeChange={setActiveType}
        onItemCategoryChange={handleItemCategoryChange}
        initialSource={initialSource}
        initialSearch={initialSearch}
      /> : graphLoading ? (
        <div role="status" className="flex min-h-80 items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading 3D knowledge map…</div>
      ) : graphError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-10 text-center"><p className="text-sm text-red-700">{graphError}</p><button type="button" onClick={() => { setGraph(null); void showSphere() }} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700">Try again</button></div>
      ) : graph ? <KnowledgeSphereView graph={graph} /> : null}
    </div>
  )
}
