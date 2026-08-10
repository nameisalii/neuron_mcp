'use client'

import { Check, ChevronDown, ChevronUp, ExternalLink, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import SourceIcon from '@/components/SourceIcon'
import KnowledgeTypePicker from '@/components/KnowledgeTypePicker'
import type { KnowledgeDisplayCategory } from '@/lib/knowledge/display'

export type KnowledgeGridItem = {
  id: string
  title: string
  summary: string
  content: string
  category: KnowledgeDisplayCategory
  source: string
  date: string
  verified: boolean
  sourceUrl: string | null
}

export const KNOWLEDGE_FILTERS: Array<{ value: 'all' | KnowledgeDisplayCategory; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'rules', label: 'Rules' },
  { value: 'decisions', label: 'Decisions' },
  { value: 'ideas', label: 'Ideas' },
  { value: 'facts', label: 'Facts' },
  { value: 'processes', label: 'Processes' },
]

const sourceLabel = (source: string) => source
  .replaceAll('_', ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase())

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function KnowledgeGrid({
  items,
  activeType,
  onTypeChange,
  onItemCategoryChange,
  initialSource = '',
  initialSearch = '',
}: {
  items: KnowledgeGridItem[]
  activeType: 'all' | KnowledgeDisplayCategory
  onTypeChange: (filter: 'all' | KnowledgeDisplayCategory) => void
  onItemCategoryChange?: (itemId: string, next: KnowledgeDisplayCategory) => void
  initialSource?: string
  initialSearch?: string
}) {
  const [selectedSources, setSelectedSources] = useState<string[]>(initialSource ? [initialSource] : [])
  const [visibleCount, setVisibleCount] = useState(8)
  const [integrationsOpen, setIntegrationsOpen] = useState(false)
  const [detailsOpenId, setDetailsOpenId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const integrationMenuRef = useRef<HTMLDivElement | null>(null)

  const sources = useMemo(() => [...new Set(items.map(item => item.source))]
    .sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b))), [items])
  const categoryCounts = useMemo(() => Object.fromEntries(
    KNOWLEDGE_FILTERS.map(filter => [
      filter.value,
      filter.value === 'all' ? items.length : items.filter(item => item.category === filter.value).length,
    ]),
  ), [items])
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const filteredItems = useMemo(() => items.filter(item => (
    (activeType === 'all' || item.category === activeType)
    && (selectedSources.length === 0 || selectedSources.includes(item.source))
    && (!normalizedSearch || [item.title, item.summary, item.content, item.source, item.category]
      .some(value => value.toLocaleLowerCase().includes(normalizedSearch)))
  )), [activeType, items, normalizedSearch, selectedSources])
  const visibleItems = filteredItems.slice(0, visibleCount)

  useEffect(() => setVisibleCount(8), [activeType, selectedSources, normalizedSearch])

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (integrationMenuRef.current && !integrationMenuRef.current.contains(event.target as Node)) {
        setIntegrationsOpen(false)
      }
    }
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [])

  function toggleSource(source: string) {
    setSelectedSources(current => current.includes(source)
      ? current.filter(value => value !== source)
      : [...current, source])
  }

  return (
    <section aria-label="Knowledge list" className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input aria-label="Search knowledge" type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search titles, content, sources, or keywords" className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-10 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
          {searchQuery && <button type="button" aria-label="Clear knowledge search" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Knowledge types">
          {KNOWLEDGE_FILTERS.map(filter => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onTypeChange(filter.value)}
              aria-pressed={activeType === filter.value}
              className={activeType === filter.value
                ? 'rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white'
                : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200'}
            >
              {filter.label} <span className={activeType === filter.value ? 'text-gray-300' : 'text-gray-400'}>{categoryCounts[filter.value]}</span>
            </button>
          ))}
        </div>

        <div ref={integrationMenuRef} className="relative w-full sm:w-64">
          <p className="mb-1.5 text-xs font-medium text-gray-500">Integrations</p>
          <button
            type="button"
            onClick={() => setIntegrationsOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={integrationsOpen}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700"
          >
            <span className="truncate">{selectedSources.length === 0 ? 'All integrations' : `${selectedSources.length} selected`}</span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>
          {integrationsOpen && (
            <div role="menu" aria-label="Integrations" className="absolute left-0 z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={selectedSources.length === 0}
                onClick={() => setSelectedSources([])}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded border border-gray-300">{selectedSources.length === 0 && <Check className="h-3 w-3" />}</span>
                All
              </button>
              {sources.map(source => {
                const selected = selectedSources.includes(source)
                return (
                  <button
                    key={source}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={selected}
                    onClick={() => toggleSource(source)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded border border-gray-300">{selected && <Check className="h-3 w-3" />}</span>
                    <SourceIcon source={source} size={16} />
                    {sourceLabel(source)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <div data-testid="knowledge-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleItems.map(item => (
            <article key={item.id} data-testid="knowledge-preview-card" className="flex min-h-44 flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <SourceIcon source={item.source} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-gray-900">{item.title}</h3>
                  <p className="mt-1.5 line-clamp-3 text-sm leading-5 text-gray-600">{item.summary || 'No additional summary.'}</p>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 text-[11px]">
                <KnowledgeTypePicker itemId={item.id} category={item.category} onCategoryChange={onItemCategoryChange} />
                <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">{sourceLabel(item.source)}</span>
                {item.verified && <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">Verified</span>}
                <time dateTime={item.date} className="ml-auto text-gray-400">{formatDate(item.date)}</time>
                <button type="button" onClick={() => setDetailsOpenId(current => current === item.id ? null : item.id)} className="inline-flex items-center gap-1 font-medium text-gray-600">
                  {detailsOpenId === item.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {detailsOpenId === item.id ? 'Hide details' : 'Details'}
                </button>
                {item.sourceUrl && (
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.title}`} className="inline-flex items-center gap-1 font-medium text-indigo-600">
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {detailsOpenId === item.id && (
                <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-600">
                  <p className="whitespace-pre-wrap break-words">{item.content}</p>
                  <p className="mt-2 text-gray-400">{sourceLabel(item.source)} · {formatDate(item.date)} · {item.verified ? 'Verified' : 'Not verified'}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">No matching knowledge yet.</p>
          <p className="mt-1 text-xs text-gray-500">{normalizedSearch ? 'Try a broader search term.' : 'Try another type or integration.'}</p>
        </div>
      )}

      {filteredItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Showing {visibleItems.length} of {filteredItems.length}</p>
          {visibleItems.length < filteredItems.length && (
            <button type="button" onClick={() => setVisibleCount(count => count + 6)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50">
              See more
            </button>
          )}
        </div>
      )}
    </section>
  )
}
