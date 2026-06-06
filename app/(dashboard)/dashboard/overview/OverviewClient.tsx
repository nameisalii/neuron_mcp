'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { Lock, Globe, ChevronRight } from 'lucide-react'

interface LabeledByEntry {
  userId: string
  displayName: string
  label: string
  at: string
}

interface ChunkItem {
  id: string
  content: string
  pageId: string
  pageTitle: string
  labeledBy: unknown
  visibility: string
  createdAt: string
}

interface ActivityItem {
  id: string
  displayName: string
  description: string
  eventType: string
  createdAt: string
}

const LABEL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  rule:         { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400' },
  decision:     { bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-400' },
  idea:         { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  process:      { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  contact:      { bg: 'bg-pink-50',    text: 'text-pink-700',    dot: 'bg-pink-400' },
  status:       { bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-400' },
  reference:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    dot: 'bg-cyan-400' },
  fact:         { bg: 'bg-slate-50',   text: 'text-slate-700',   dot: 'bg-slate-400' },
  meeting_note: { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-400' },
}

function getColors(label: string) {
  return LABEL_COLORS[label] ?? { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' }
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function getLabeler(labeledBy: unknown, label: string): string | null {
  if (!Array.isArray(labeledBy)) return null
  const entry = (labeledBy as LabeledByEntry[]).find((e) => e.label === label)
  return entry?.displayName ?? null
}

interface Props {
  labelCounts: Record<string, number>
  chunksByLabel: Record<string, ChunkItem[]>
  totalChunks: number
  labeledCount: number
  recentActivity: ActivityItem[]
  workspaceType: string
}

export default function OverviewClient({
  labelCounts,
  chunksByLabel,
  totalChunks,
  labeledCount,
  recentActivity,
  workspaceType,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showPersonal, setShowPersonal] = useState(false)
  const router = useRouter()

  const sorted = Object.entries(labelCounts).sort(([, a], [, b]) => b - a)

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Knowledge Overview</h1>
        <p className="text-sm text-gray-500 mt-1">
          {totalChunks} chunks · {labeledCount} labeled
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">No labeled knowledge yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Open a Notion page and label chunks as rules, decisions, ideas, etc.
          </p>
        </div>
      ) : (
        <>
          {/* Label cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {sorted.map(([label, count]) => {
              const colors = getColors(label)
              const isExpanded = expanded === label
              return (
                <button
                  key={label}
                  onClick={() => setExpanded(isExpanded ? null : label)}
                  className={clsx(
                    'text-left p-4 rounded-xl border transition-all',
                    isExpanded
                      ? 'border-gray-300 bg-white shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm',
                  )}
                >
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium mb-3 ${colors.bg} ${colors.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                    {label}
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    chunk{count !== 1 ? 's' : ''}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Personal toggle for teams */}
          {workspaceType === 'team' && (
            <div className="mb-4">
              <button
                onClick={() => setShowPersonal(!showPersonal)}
                className={clsx(
                  'inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors',
                  showPersonal
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-500 hover:text-gray-700',
                )}
              >
                {showPersonal ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {showPersonal ? 'Showing personal items' : 'Show my personal items'}
              </button>
            </div>
          )}

          {/* Expanded label detail */}
          <AnimatePresence>
            {expanded && chunksByLabel[expanded] && (
              <motion.div
                key={expanded}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-6"
              >
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-800 capitalize">
                      {expanded} chunks ({labelCounts[expanded]})
                    </h3>
                    <button
                      onClick={() => setExpanded(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {chunksByLabel[expanded]
                      .filter((c) => showPersonal || c.visibility === 'team')
                      .map((chunk) => {
                        const labeler = getLabeler(chunk.labeledBy, expanded)
                        return (
                          <button
                            key={chunk.id}
                            onClick={() => router.push(`/dashboard/notion/${chunk.pageId}`)}
                            className="w-full text-left p-3 rounded-lg bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
                          >
                            <p className="text-sm text-gray-700 line-clamp-2">{chunk.content}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-xs text-gray-400">{chunk.pageTitle}</span>
                              {labeler && (
                                <span className="text-xs text-gray-400">by {labeler}</span>
                              )}
                              <span className="text-xs text-gray-300">{timeAgo(chunk.createdAt)}</span>
                              {chunk.visibility === 'personal' && (
                                <Lock className="w-2.5 h-2.5 text-gray-300" />
                              )}
                            </div>
                          </button>
                        )
                      })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
            <button
              onClick={() => router.push('/dashboard/activity')}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-0.5">
            {recentActivity.map((event) => (
              <div
                key={event.id}
                className="flex gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600">
                    <span className="font-medium text-gray-800">{event.displayName}</span>
                    {' '}{event.description}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{timeAgo(event.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
