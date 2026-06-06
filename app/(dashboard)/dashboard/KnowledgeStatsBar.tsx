'use client'

import { Shield, Gavel, Lightbulb, Repeat2, User, Signal, Link2, FileText, Calendar, Tag } from 'lucide-react'
import { getLabelMeta } from '@/lib/labelColors'
import { clsx } from 'clsx'

const LABEL_ICONS: Record<string, React.ElementType> = {
  rule:         Shield,
  decision:     Gavel,
  idea:         Lightbulb,
  process:      Repeat2,
  contact:      User,
  status:       Signal,
  reference:    Link2,
  fact:         FileText,
  context:      FileText,
  meeting_note: Calendar,
}

interface StatCard {
  label: string
  count: number
}

interface KnowledgeStatsBarProps {
  stats: StatCard[]
  activeLabels: string[]
  onToggle: (label: string) => void
}

export default function KnowledgeStatsBar({ stats, activeLabels, onToggle }: KnowledgeStatsBarProps) {
  if (stats.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {stats.map(({ label, count }) => {
        const meta = getLabelMeta(label)
        const Icon = LABEL_ICONS[label] ?? Tag
        const isActive = activeLabels.includes(label)

        return (
          <button
            key={label}
            onClick={() => onToggle(label)}
            className={clsx(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
              isActive
                ? `${meta.activeBg} ${meta.text} ${meta.border} shadow-sm`
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <Icon className={clsx('w-3.5 h-3.5', isActive ? meta.text : 'text-gray-400')} />
            <span>{meta.displayName}</span>
            <span
              className={clsx(
                'ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold',
                isActive ? `${meta.bg} ${meta.text}` : 'bg-gray-100 text-gray-500'
              )}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
