'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, AlertTriangle, ShieldCheck, X, ExternalLink, Archive, Tags } from 'lucide-react'
import { Card } from '@/components/ui/card'
import KnowledgeCard from '@/components/KnowledgeCard'
import { clsx } from 'clsx'
import { KNOWLEDGE_CATEGORY_OPTIONS } from '@/lib/knowledge/categories'

export interface KnowledgeItemRow {
  id: string
  content: string
  displayTitle: string
  displaySummary: string
  summary?: string | null
  displayStatus: string
  displayTags: string[]
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
  displaySourceUrl?: string | null
  sourceExternalId?: string | null
  displayOwner?: string | null
  displaySourceCreatedAt?: string | null
  updatedAt?: string | null
  notionPageTitle?: string | null
  sourceMetadata?: unknown
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const activeCategory = FILTERS.find((filter) => filter.value === activeFilter)?.category
  const displayItems = dedupeLinearItems(localItems)
  const filtered = displayItems.filter((item) => {
    const status = item.displayStatus
    const matchesFilter = !activeCategory || item.category === activeCategory
    const matchesStatus = statusFilter === 'all' ? status !== 'archived' : status === statusFilter
    const matchesSource = sourceFilter === 'all' || item.source === sourceFilter
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter
    const matchesSearch =
      !search || [item.displayTitle, item.displaySummary, item.content, ...item.displayTags].some(value => value?.toLowerCase().includes(search.toLowerCase()))
    return matchesFilter && matchesStatus && matchesSource && matchesCategory && matchesSearch
  })
  const sources = [...new Set(displayItems.map(item => item.source))].sort()
  const categories = [...new Set(displayItems.map(item => item.category))].sort()

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
        setLocalItems((prev) => prev.map((item) => (
          item.id === id ? { ...item, verified: true, displayStatus: 'verified' } : item
        )))
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
      <div className="flex flex-col gap-3">
        <div className="flex gap-1 flex-wrap">
          {[['all','All'],['verified','Verified'],['needs_review','Needs review'],['outdated','Outdated'],['conflicting','Conflicting'],['archived','Archived']].map(([value,label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                statusFilter === value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search knowledge…" className="px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <select aria-label="Filter by source" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"><option value="all">All sources</option>{sources.map(source => <option key={source} value={source}>{source}</option>)}</select>
          <select aria-label="Filter by category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"><option value="all">All categories</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select>
        </div>
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
                  title: item.displayTitle,
                  sourceUrl: item.displaySourceUrl,
                  owner: item.displayOwner,
                  sourceCreatedAt: item.displaySourceCreatedAt,
                  updatedAt: item.updatedAt ?? item.createdAt,
                }}
                footer={
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setSelectedId(item.id)} className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">Open</button>
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
      {selectedId && <KnowledgeDetail id={selectedId} close={() => setSelectedId(null)} changed={(updated) => setLocalItems(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item))} />}
    </div>
  )
}

function KnowledgeDetail({ id, close, changed }: { id: string; close: () => void; changed: (item: Partial<KnowledgeItemRow> & { id: string }) => void }) {
  const [data, setData] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetch(`/api/knowledge/${id}`).then(response => response.json()).then(setData).catch(() => setData({ error: true })) }, [id])
  async function update(body: Record<string, unknown>) {
    setBusy(true)
    const response = await fetch(`/api/knowledge/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json(); setBusy(false)
    if (response.ok) { setData((current: any) => ({ ...current, item: result.item })); changed(result.item) }
  }
  const item = data?.item
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={close}>
    <aside aria-label="Knowledge details" onClick={event => event.stopPropagation()} className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Knowledge detail</p><h2 className="mt-1 text-xl font-semibold">{item?.displayTitle || 'Company knowledge'}</h2></div><button aria-label="Close knowledge details" onClick={close}><X className="h-5 w-5"/></button></div>
      {!item ? <p className="mt-8 text-sm text-gray-500">Loading knowledge…</p> : <div className="mt-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Title<input defaultValue={item.displayTitle ?? ''} onBlur={event => void update({ title: event.target.value || null })} className="mt-1 w-full rounded-lg border px-3 py-2"/></label><label className="text-sm font-medium">Category<select value={item.category} onChange={event => void update({ category: event.target.value })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">{KNOWLEDGE_CATEGORY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        <label className="block text-sm font-medium">Summary<textarea defaultValue={item.summary ?? ''} onBlur={event => void update({ summary: event.target.value || null })} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
        <div className="flex flex-wrap gap-2">{['verified','needs_review','outdated','conflicting'].map(status => <button disabled={busy} key={status} onClick={() => void update({ status })} className={clsx('rounded-full border px-3 py-1.5 text-xs capitalize', item.displayStatus === status && 'bg-black text-white')}>{status.replace('_',' ')}</button>)}<button disabled={busy} onClick={() => void update({ status: 'archived' })} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-600"><Archive className="h-3 w-3"/> Archive</button></div>
        <label className="block text-sm font-medium"><span className="inline-flex items-center gap-1"><Tags className="h-4 w-4"/> Tags</span><input defaultValue={item.displayTags.join(', ')} onBlur={event => void update({ tags: event.target.value.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) })} placeholder="policy, customer, onboarding" className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
        <section><h3 className="text-sm font-semibold">Original content</h3><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">{item.content}</pre></section>
        <dl className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2"><div><dt className="text-gray-400">Source</dt><dd className="capitalize">{item.source} · {item.sourceExternalId ? 'Synced' : 'Manual'}</dd></div><div><dt className="text-gray-400">Updated</dt><dd>{new Date(item.updatedAt).toLocaleString()}</dd></div>{item.displayOwner && <div><dt className="text-gray-400">Owner</dt><dd>{item.displayOwner}</dd></div>}{item.displaySourceUrl && <div className="sm:col-span-2"><a href={item.displaySourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600">Open original source <ExternalLink className="h-3 w-3"/></a></div>}</dl>
        <Related title="Related tasks" values={data.related.tasks.map((value: any) => `${value.title} · ${value.status}`)}/><Related title="Related decisions" values={data.related.decisions.map((value: any) => value.title)}/><Related title="Related documents" values={data.related.documents.map((value: any) => value.fileName)}/>
        <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Source metadata</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-gray-500">{JSON.stringify(item.sourceMetadata ?? {}, null, 2)}</pre></details>
      </div>}
    </aside>
  </div>
}

function Related({ title, values }: { title: string; values: string[] }) { return <section><h3 className="text-sm font-semibold">{title}</h3><div className="mt-2 rounded-xl border p-3 text-sm text-gray-500">{values.length ? values.map(value => <p key={value}>{value}</p>) : 'None yet'}</div></section> }

function dedupeLinearItems(items: KnowledgeItemRow[]): KnowledgeItemRow[] {
  const grouped = new Map<string, KnowledgeItemRow>()
  for (const item of items) {
    const key = item.source === 'linear' && (item.sourceExternalId || item.displaySourceUrl)
      ? `linear:${item.sourceExternalId ?? item.displaySourceUrl}`
      : `${item.source}:${item.id}`
    const existing = grouped.get(key)
    if (!existing || linearCardQuality(item) > linearCardQuality(existing)) grouped.set(key, item)
  }
  return [...grouped.values()]
}

function linearCardQuality(item: KnowledgeItemRow): number {
  return Number(/^Linear issue\s+[^:]+:/i.test(item.content)) * 10 + item.content.length / 10000
}
