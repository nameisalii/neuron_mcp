'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getLabelMeta } from '@/lib/labelColors'
import { formatKnowledgeItemPreview, type KnowledgePreviewInput } from '@/lib/knowledge/preview'
import { KNOWLEDGE_CATEGORY_OPTIONS, labelForKnowledgeCategory } from '@/lib/knowledge/categories'
import SourceIcon from '@/components/SourceIcon'

interface Props {
  item: KnowledgePreviewInput
  footer?: ReactNode
  compact?: boolean
  onCategoryChange?: (id: string, nextCategory: string, previousCategory: string, phase: 'optimistic' | 'confirmed' | 'revert') => void
}

export default function KnowledgeCard({ item, footer, compact = false, onCategoryChange }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [categoryValue, setCategoryValue] = useState(item.category)
  const [aiSuggestedCategory, setAiSuggestedCategory] = useState(item.aiSuggestedCategory ?? null)
  const [typeOverriddenByUser, setTypeOverriddenByUser] = useState(Boolean(item.typeOverriddenByUser))
  const [menuOpen, setMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const itemForPreview = { ...item, category: categoryValue, aiSuggestedCategory, typeOverriddenByUser }
  const preview = formatKnowledgeItemPreview(itemForPreview)
  const category = getLabelMeta(categoryValue)
  const canRetag = Boolean(item.id)
  const showReset = Boolean(aiSuggestedCategory && aiSuggestedCategory !== categoryValue && typeOverriddenByUser)

  useEffect(() => {
    setCategoryValue(item.category)
    setAiSuggestedCategory(item.aiSuggestedCategory ?? null)
    setTypeOverriddenByUser(Boolean(item.typeOverriddenByUser))
  }, [item.category, item.aiSuggestedCategory, item.typeOverriddenByUser])

  useEffect(() => {
    function close(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  async function updateCategory(nextCategory: string, resetToAiSuggestion = false) {
    if (!item.id || saving) return
    const previous = categoryValue
    const optimistic = resetToAiSuggestion && aiSuggestedCategory ? aiSuggestedCategory : nextCategory
    setSaving(true)
    setError(null)
    setMessage(null)
    setMenuOpen(false)
    setCategoryValue(optimistic)
    setTypeOverriddenByUser(!resetToAiSuggestion)
    onCategoryChange?.(item.id, optimistic, previous, 'optimistic')

    try {
      const res = await fetch(`/api/knowledge-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resetToAiSuggestion ? { resetToAiSuggestion: true } : { type: nextCategory.toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not update type')
      setCategoryValue(data.category)
      setAiSuggestedCategory(data.aiSuggestedCategory ?? null)
      setTypeOverriddenByUser(Boolean(data.typeOverriddenByUser))
      onCategoryChange?.(item.id, data.category, previous, 'confirmed')
      setMessage(resetToAiSuggestion ? `Reset to ${labelForKnowledgeCategory(data.category)}` : `Updated to ${labelForKnowledgeCategory(data.category)}`)
    } catch {
      setCategoryValue(previous)
      setTypeOverriddenByUser(Boolean(item.typeOverriddenByUser))
      onCategoryChange?.(item.id, previous, optimistic, 'revert')
      setError('Could not update type')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card padding="sm" className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <SourceIcon source={item.source} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="text-sm font-semibold text-gray-900 leading-snug flex-1">{preview.displayTitle}</h3>
            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                disabled={!canRetag || saving}
                onClick={(event) => {
                  event.stopPropagation()
                  if (canRetag) setMenuOpen((value) => !value)
                }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${category.bg} ${category.text} ${canRetag ? 'hover:ring-1 hover:ring-gray-300' : 'cursor-default'} disabled:opacity-60`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title={canRetag ? 'Change type' : undefined}
              >
                {category.displayName}
                {canRetag && <ChevronDown className="w-3 h-3" />}
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                  {KNOWLEDGE_CATEGORY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={categoryValue === option.value}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (option.value !== categoryValue) void updateCategory(option.value)
                        else setMenuOpen(false)
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <span>{option.label}</span>
                      {categoryValue === option.value && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </button>
                  ))}
                  {showReset && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(event) => {
                        event.stopPropagation()
                        void updateCategory(aiSuggestedCategory!, true)
                      }}
                      className="flex w-full border-t border-gray-100 px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50"
                    >
                      Reset to AI suggestion
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className={`text-sm text-gray-600 leading-relaxed mt-1.5 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>
            {preview.displaySummary}
          </p>
          {(message || error) && (
            <p className={`mt-1 text-xs ${error ? 'text-red-600' : 'text-green-600'}`}>
              {error ?? message}
            </p>
          )}
        </div>
      </div>

      {preview.metadataChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {preview.metadataChips.map((chip, index) => (
            <span key={`${chip.label}-${chip.value}-${index}`} title={chip.label} className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600">
              {chip.value}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
        {item.sourceUrl && preview.sourceActionLabel && (
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
            {preview.sourceActionLabel}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {preview.githubLinks.map((link, index) => (
          <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800">
            {preview.githubLinks.length > 1 ? `Open GitHub link ${index + 1}` : 'Open GitHub PR'}
            <ExternalLink className="w-3 h-3" />
          </a>
        ))}
        <button type="button" onClick={() => setDetailsOpen((value) => !value)} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700">
          {detailsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {detailsOpen ? 'Hide details' : 'Show details'}
        </button>
        {footer && <div className="ml-auto">{footer}</div>}
      </div>

      {detailsOpen && (
        <div className="rounded-md bg-gray-50 border border-gray-100 p-3 space-y-3">
          {preview.details.length > 0 && (
            <dl className="grid gap-2 sm:grid-cols-2">
              {preview.details.map((detail) => (
                <div key={`${detail.label}-${detail.value}`} className={detail.value.length > 100 ? 'sm:col-span-2' : ''}>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{detail.label}</dt>
                  <dd className="text-xs text-gray-700 whitespace-pre-line mt-0.5">{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <details>
            <summary className="cursor-pointer text-xs font-medium text-gray-500">Raw source text</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-500 max-h-72 overflow-auto">{preview.rawContent}</pre>
          </details>
        </div>
      )}
    </Card>
  )
}
