'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronRight, Globe, Lock, Tag } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LabeledByEntry } from '@/types'
import ChunkBlock from './ChunkBlock'

const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  rule:         { bg: 'bg-blue-100',    text: 'text-blue-700' },
  decision:     { bg: 'bg-purple-100',  text: 'text-purple-700' },
  process:      { bg: 'bg-amber-100',   text: 'text-amber-700' },
  idea:         { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  fact:         { bg: 'bg-slate-100',   text: 'text-slate-700' },
  context:      { bg: 'bg-gray-100',    text: 'text-gray-600' },
  reference:    { bg: 'bg-cyan-100',    text: 'text-cyan-700' },
  meeting_note: { bg: 'bg-pink-100',    text: 'text-pink-700' },
}

const PRESET_LABELS = ['rule', 'decision', 'process', 'idea', 'fact', 'context', 'reference', 'meeting_note']

export interface ChunkMeta {
  id: string
  content: string
  blockType: string
  position: number
  labels: unknown
  labeledBy: unknown
  visibility: string
  metadata?: Record<string, unknown>
}

export interface ChunkNode {
  chunk: ChunkMeta
  children: ChunkNode[]
}

interface ToggleBlockProps {
  node: ChunkNode
  userId: string
}

export default function ToggleBlock({ node, userId }: ToggleBlockProps) {
  const { chunk, children } = node
  const [open, setOpen] = useState(false)
  const [allLabels, setAllLabels] = useState<string[]>((chunk.labels as string[]) ?? [])
  const [labeledBy, setLabeledBy] = useState<LabeledByEntry[]>((chunk.labeledBy as LabeledByEntry[]) ?? [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const myLabels = labeledBy.filter((e) => e.userId === userId).map((e) => e.label)
  const isLabeled = allLabels.length > 0

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const applyMyLabels = async (newMyLabels: string[]) => {
    const prev = { allLabels, labeledBy }
    const otherLabels = labeledBy.filter((e) => e.userId !== userId).map((e) => e.label)
    setAllLabels([...new Set([...otherLabels, ...newMyLabels])])
    setSaving(true)
    try {
      const res = await fetch(`/api/notion/chunks/${chunk.id}/labels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: newMyLabels }),
      })
      if (!res.ok) {
        setAllLabels(prev.allLabels)
        setLabeledBy(prev.labeledBy)
      } else {
        const data = await res.json() as { chunk: { labels: string[]; labeledBy: LabeledByEntry[] } }
        setAllLabels(data.chunk.labels)
        setLabeledBy(data.chunk.labeledBy)
      }
    } catch {
      setAllLabels(prev.allLabels)
      setLabeledBy(prev.labeledBy)
    } finally {
      setSaving(false)
    }
  }

  const toggleLabel = (label: string) => {
    const next = myLabels.includes(label)
      ? myLabels.filter((l) => l !== label)
      : [...myLabels, label]
    applyMyLabels(next)
    setPickerOpen(false)
  }

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isLabeled
          ? 'border-gray-200 bg-white'
          : 'border-transparent bg-gray-50 hover:border-gray-200 hover:bg-white'
      }`}
    >
      {/* Clickable header row */}
      <div className="group relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 w-full px-4 py-3 text-left rounded-t-lg transition-colors hover:bg-gray-100"
        >
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="text-gray-400 shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </motion.span>
          <span className="text-sm font-medium text-gray-900">{chunk.content}</span>
        </button>

        {/* Label bar */}
        <div
          className={`px-4 pb-2 flex flex-wrap items-center gap-2 ${
            isLabeled ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'
          }`}
        >
          {allLabels.map((label) => {
            const colors = LABEL_COLORS[label] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }
            const labelers = labeledBy.filter((e) => e.label === label)
            const isMine = myLabels.includes(label)
            return (
              <button
                key={label}
                onClick={() => isMine && toggleLabel(label)}
                title={
                  labelers.length > 0
                    ? `${labelers.map((e) => e.displayName).join(', ')}${isMine ? ' — click to remove' : ''}`
                    : label
                }
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} ${isMine ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'} transition-opacity`}
              >
                {label}
                {labelers.length > 0 && (
                  <span className="opacity-70">
                    · {labelers.map((e) => e.displayName.split(' ')[0]).join(', ')}
                  </span>
                )}
              </button>
            )
          })}

          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              disabled={saving}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              <Tag className="w-3 h-3" />
              {saving ? 'Saving…' : 'Label'}
            </button>

            {pickerOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg p-2 w-44">
                <p className="text-xs text-gray-400 mb-1.5 px-1">Select labels</p>
                <div className="space-y-0.5">
                  {PRESET_LABELS.map((l) => {
                    const colors = LABEL_COLORS[l] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }
                    const active = myLabels.includes(l)
                    return (
                      <button
                        key={l}
                        onClick={() => toggleLabel(l)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium text-left transition-colors ${
                          active
                            ? `${colors.bg} ${colors.text}`
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            active ? colors.bg.replace('100', '500') : 'bg-gray-200'
                          }`}
                        />
                        {l.replace('_', ' ')}
                        {active && <span className="ml-auto text-gray-400">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <span className="ml-auto" title={chunk.visibility === 'personal' ? 'Personal' : 'Team'}>
            {chunk.visibility === 'personal' ? (
              <Lock className="w-3 h-3 text-gray-400" />
            ) : (
              <Globe className="w-3 h-3 text-gray-300" />
            )}
          </span>
        </div>
      </div>

      {/* Expandable children */}
      <AnimatePresence initial={false}>
        {open && children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pl-6 pr-2 pb-3 space-y-2 border-t border-gray-100 pt-2">
              {children.map((child) =>
                child.chunk.blockType === 'toggle' ? (
                  <ToggleBlock key={child.chunk.id} node={child} userId={userId} />
                ) : (
                  <ChunkBlock key={child.chunk.id} chunk={child.chunk} userId={userId} />
                ),
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
