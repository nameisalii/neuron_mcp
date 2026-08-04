'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KnowledgeDisplayCategory } from '@/lib/knowledge/display'

/**
 * Compact type control for a knowledge item.
 *
 * The grid works in plural display categories ('rules'), the API in singular
 * uppercase values ('RULE'). This component owns that translation so callers
 * keep using display categories.
 */

/** The four user-selectable types, in the order the product spec lists them. */
export const KNOWLEDGE_TYPE_CHOICES = [
  { display: 'facts', api: 'FACT', label: 'Fact' },
  { display: 'rules', api: 'RULE', label: 'Rule' },
  { display: 'decisions', api: 'DECISION', label: 'Decision' },
  { display: 'ideas', api: 'IDEA', label: 'Idea' },
] as const satisfies ReadonlyArray<{ display: KnowledgeDisplayCategory; api: string; label: string }>

/** Types that exist in the schema but are not user-selectable; shown, not offered. */
const READ_ONLY_LABELS: Partial<Record<KnowledgeDisplayCategory, string>> = {
  processes: 'Process',
  other: 'Uncategorized',
}

export function labelForDisplayCategory(category: KnowledgeDisplayCategory): string {
  return KNOWLEDGE_TYPE_CHOICES.find((choice) => choice.display === category)?.label
    ?? READ_ONLY_LABELS[category]
    ?? 'Uncategorized'
}

interface KnowledgeTypePickerProps {
  itemId: string
  category: KnowledgeDisplayCategory
  onCategoryChange?: (itemId: string, next: KnowledgeDisplayCategory) => void
}

export default function KnowledgeTypePicker({ itemId, category, onCategoryChange }: KnowledgeTypePickerProps) {
  const [value, setValue] = useState<KnowledgeDisplayCategory>(category)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setValue(category), [category])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  async function select(choice: (typeof KNOWLEDGE_TYPE_CHOICES)[number]) {
    setOpen(false)
    if (choice.display === value) return

    const previous = value
    // Update the badge AND notify the parent before the round-trip, so filter
    // counts and summary cards move on click instead of after the network.
    setValue(choice.display)
    onCategoryChange?.(itemId, choice.display)
    setSaving(true)
    setError('')

    try {
      const response = await fetch(`/api/knowledge-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: choice.api }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Could not update type')
    } catch (err) {
      // Roll back both the badge and the parent so nothing lies about stored state.
      setValue(previous)
      onCategoryChange?.(itemId, previous)
      setError(err instanceof Error ? err.message : 'Could not update type')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        disabled={saving}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Type"
        title="Change type"
        className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 font-medium text-indigo-700 hover:ring-1 hover:ring-indigo-200 disabled:opacity-60"
      >
        {labelForDisplayCategory(value)}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 z-20 mt-1 w-40 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          {KNOWLEDGE_TYPE_CHOICES.map((choice) => (
            <button
              key={choice.api}
              type="button"
              role="menuitemradio"
              aria-checked={value === choice.display}
              onClick={(event) => {
                event.stopPropagation()
                void select(choice)
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
            >
              <span>{choice.label}</span>
              {value === choice.display && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
