'use client'

import { useMemo, useState } from 'react'
import { Brain, Clock, GitBranch, Lightbulb } from 'lucide-react'
import { clsx } from 'clsx'
import { Card } from '@/components/ui/card'
import BrainGrid, { type KnowledgeItemRow } from '../brain/BrainGrid'

interface Props {
  activeFilter: string
  initialItems: KnowledgeItemRow[]
  initialCounts: {
    all: number
    decision: number
    idea: number
  }
  lastSyncLabel: string
}

export default function OverviewClient({ activeFilter, initialItems, initialCounts, lastSyncLabel }: Props) {
  const [items, setItems] = useState(initialItems)
  const [overrides, setOverrides] = useState<Record<string, { from: string; to: string }>>({})

  const counts = useMemo(() => {
    const next = { ...initialCounts }
    for (const change of Object.values(overrides)) {
      if (change.from === change.to) continue
      if (change.from === 'decision') next.decision--
      if (change.to === 'decision') next.decision++
      if (change.from === 'idea') next.idea--
      if (change.to === 'idea') next.idea++
    }
    return next
  }, [initialCounts, overrides])

  function handleCategoryChange(id: string, nextCategory: string) {
    setItems((prev) => prev.map((item) => {
      if (item.id !== id) return item
      setOverrides((current) => {
        const original = current[id]?.from ?? item.category
        const updated = { ...current }
        if (original === nextCategory) delete updated[id]
        else updated[id] = { from: original, to: nextCategory }
        return updated
      })
      return { ...item, category: nextCategory, typeOverriddenByUser: true }
    }))
  }

  const stats = [
    { label: 'Knowledge Items', value: counts.all, icon: Brain, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Decisions', value: counts.decision, icon: GitBranch, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Ideas', value: counts.idea, icon: Lightbulb, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Last Sync', value: lastSyncLabel, icon: Clock, color: 'text-gray-600', bg: 'bg-gray-50', isText: true },
  ]

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} padding="sm">
            <div className={clsx('w-8 h-8 rounded-md flex items-center justify-center mb-3', stat.bg)}>
              <stat.icon className={clsx('w-4 h-4', stat.color)} />
            </div>
            <p className={clsx('font-bold', stat.isText ? 'text-lg text-gray-700' : 'text-2xl text-gray-900')}>
              {stat.value}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </Card>
        ))}
      </div>

      <BrainGrid activeFilter={activeFilter} items={items} onCategoryChange={handleCategoryChange} />
    </>
  )
}
