'use client'

import { useState, useEffect, useRef } from 'react'
import { Globe, Lock, Tag } from 'lucide-react'
import type { LabeledByEntry } from '@/types'

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

interface ChunkData {
  id: string
  content: string
  blockType: string
  position: number
  labels: unknown
  labeledBy: unknown
  visibility: string
}

interface ChunkBlockProps {
  chunk: ChunkData
  userId: string
}

function ContentNode({ chunk }: { chunk: ChunkData }) {
  switch (chunk.blockType) {
    case 'heading_1':
      return <h2 className="text-2xl font-bold text-gray-900">{chunk.content}</h2>
    case 'heading_2':
      return <h3 className="text-xl font-semibold text-gray-900">{chunk.content}</h3>
    case 'heading_3':
      return <h4 className="text-lg font-medium text-gray-900">{chunk.content}</h4>
    case 'bulleted_list_item':
      return (
        <div className="flex gap-2">
          <span className="text-gray-400 mt-0.5 shrink-0">•</span>
          <p className="text-sm text-gray-700">{chunk.content}</p>
        </div>
      )
    case 'numbered_list_item':
      return (
        <div className="flex gap-2">
          <span className="text-gray-400 mt-0.5 shrink-0 text-sm">{chunk.position + 1}.</span>
          <p className="text-sm text-gray-700">{chunk.content}</p>
        </div>
      )
    case 'code':
      return (
        <pre className="bg-gray-900 text-gray-100 rounded-md px-4 py-3 text-xs font-mono overflow-x-auto">
          <code>{chunk.content}</code>
        </pre>
      )
    case 'callout':
      return (
        <div className="flex gap-3 border-l-4 border-amber-400 bg-amber-50 rounded-r-md px-4 py-3">
          <span className="text-amber-500 shrink-0">💡</span>
          <p className="text-sm text-gray-700">{chunk.content}</p>
        </div>
      )
    case 'quote':
      return (
        <blockquote className="border-l-4 border-gray-300 pl-4 italic text-sm text-gray-600">
          {chunk.content}
        </blockquote>
      )
    case 'table_row':
      return (
        <div className="grid grid-cols-3 gap-2 text-sm text-gray-700 bg-gray-50 rounded px-3 py-2 font-mono text-xs">
          {chunk.content.split(' | ').map((cell, i) => (
            <span key={i} className="truncate">{cell}</span>
          ))}
        </div>
      )
    default:
      return <p className="text-sm text-gray-700 leading-relaxed">{chunk.content}</p>
  }
}

export default function ChunkBlock({ chunk, userId }: ChunkBlockProps) {
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
    // Optimistic: merge my new labels with other users' labels
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
      className={`group relative rounded-lg border px-4 py-3 transition-colors ${
        isLabeled
          ? 'border-gray-200 bg-white'
          : 'border-transparent bg-gray-50 hover:border-gray-200 hover:bg-white'
      }`}
    >
      <ContentNode chunk={chunk} />

      {/* Label bar — always reserve space when labeled, fade in on hover otherwise */}
      <div
        className={`mt-2 flex flex-wrap items-center gap-2 ${
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

        {/* Add label picker */}
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
                        className={`w-2 h-2 rounded-full shrink-0 ${active ? colors.bg.replace('100', '500') : 'bg-gray-200'}`}
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
  )
}
