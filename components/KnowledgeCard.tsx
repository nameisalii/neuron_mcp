'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getLabelMeta } from '@/lib/labelColors'
import { formatKnowledgeItemPreview, type KnowledgePreviewInput } from '@/lib/knowledge/preview'
import SourceIcon from '@/components/SourceIcon'

interface Props {
  item: KnowledgePreviewInput
  footer?: ReactNode
  compact?: boolean
}

export default function KnowledgeCard({ item, footer, compact = false }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const preview = formatKnowledgeItemPreview(item)
  const category = getLabelMeta(item.category)

  return (
    <Card padding="sm" className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <SourceIcon source={item.source} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="text-sm font-semibold text-gray-900 leading-snug flex-1">{preview.displayTitle}</h3>
            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium shrink-0 ${category.bg} ${category.text}`}>
              {category.displayName}
            </span>
          </div>
          <p className={`text-sm text-gray-600 leading-relaxed mt-1.5 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>
            {preview.displaySummary}
          </p>
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
