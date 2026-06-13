'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, ChevronRight, Loader2, Mail } from 'lucide-react'
import { createPortal } from 'react-dom'
import { DEFAULT_GMAIL_LABELS } from '@/lib/gmail/config'

type GmailLabel = {
  id: string
  name: string
  type: 'system' | 'user'
  messageCount: number
  unreadCount: number
}

type GmailMetadata = {
  selectedLabels?: string[]
  selectedLabelNames?: string[]
  timeWindow?: number
  syncFrom?: string | null
  senderFilter?: string[]
  excludeFilter?: string[]
  maxMessages?: number
  privacy?: 'personal'
  configured?: boolean
}

interface GmailSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onConfigured: () => void
  connected: boolean
  initialStep?: 0 | 1 | 2 | 3
  metadata: GmailMetadata | null
}

const EXCLUDED_DEFAULTS = new Set(['SPAM', 'TRASH', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL'])

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseDateInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export default function GmailSetupModal({
  isOpen,
  onClose,
  onConfigured,
  connected,
  initialStep = 1,
  metadata,
}: GmailSetupModalProps) {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState<0 | 1 | 2 | 3>(initialStep)
  const [labels, setLabels] = useState<GmailLabel[]>([])
  const [labelsLoading, setLabelsLoading] = useState(false)
  const [labelsError, setLabelsError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>(metadata?.selectedLabels ?? [])
  const [syncFrom, setSyncFrom] = useState(metadata?.syncFrom ? metadata.syncFrom.slice(0, 10) : '')
  const [senderFilter, setSenderFilter] = useState((metadata?.senderFilter ?? []).join(', '))
  const [excludeFilter, setExcludeFilter] = useState((metadata?.excludeFilter ?? []).join(', '))
  const [maxMessages, setMaxMessages] = useState(String(metadata?.maxMessages ?? 200))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estimatedMessages, setEstimatedMessages] = useState<number | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!isOpen) return
    setStep(initialStep)
    setSelected(metadata?.selectedLabels ?? [])
    setSyncFrom(metadata?.syncFrom ? metadata.syncFrom.slice(0, 10) : '')
    setSenderFilter((metadata?.senderFilter ?? []).join(', '))
    setExcludeFilter((metadata?.excludeFilter ?? []).join(', '))
    setMaxMessages(String(metadata?.maxMessages ?? 200))
    setError(null)
    setEstimatedMessages(null)
  }, [isOpen, initialStep, metadata])

  useEffect(() => {
    if (!isOpen || !connected || labels.length > 0 || labelsLoading) return
    setLabelsLoading(true)
    setLabelsError(null)
    fetch('/api/integrations/gmail/labels')
      .then(async (res) => {
        const data = await res.json() as { labels?: GmailLabel[]; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Failed to load Gmail labels')
        setLabels(data.labels ?? [])
        const current = metadata?.selectedLabels ?? []
        if (current.length > 0) {
          setSelected(current)
          return
        }
        const suggested = (data.labels ?? [])
          .filter((label) => DEFAULT_GMAIL_LABELS.includes(label.id.toUpperCase() as typeof DEFAULT_GMAIL_LABELS[number]) && !EXCLUDED_DEFAULTS.has(label.id.toUpperCase()))
          .map((label) => label.id)
        setSelected(suggested.length > 0 ? suggested : (data.labels ?? []).filter((label) => label.type === 'user').slice(0, 3).map((label) => label.id))
      })
      .catch((err) => setLabelsError(err instanceof Error ? err.message : 'Failed to load Gmail labels'))
      .finally(() => setLabelsLoading(false))
  }, [connected, isOpen, labels.length, labelsLoading, metadata?.selectedLabels])

  const selectedNames = useMemo(() => {
    const map = new Map(labels.map((label) => [label.id, label.name]))
    return selected.map((id) => map.get(id) ?? id)
  }, [labels, selected])

  const filtersPreview = useMemo(() => ({
    syncFrom: syncFrom || 'Not set',
    senderFilter: senderFilter || 'None',
    excludeFilter: excludeFilter || 'None',
    maxMessages,
  }), [excludeFilter, maxMessages, senderFilter, syncFrom])

  async function handleConfigureAndSync() {
    setSaving(true)
    setError(null)
    try {
      const configureRes = await fetch('/api/integrations/gmail/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedLabels: selected,
          selectedLabelNames: selectedNames,
          timeWindow: syncFrom ? Math.max(1, Math.ceil((Date.now() - new Date(syncFrom).getTime()) / (24 * 60 * 60 * 1000))) : 30,
          syncFrom: parseDateInput(syncFrom),
          senderFilter: splitCsv(senderFilter),
          excludeFilter: splitCsv(excludeFilter),
          maxMessages: Number(maxMessages) || 200,
        }),
      })
      const configureData = await configureRes.json() as { error?: string; estimatedMessages?: number }
      if (!configureRes.ok) throw new Error(configureData.error ?? 'Failed to save Gmail configuration')
      setEstimatedMessages(configureData.estimatedMessages ?? null)

      const syncRes = await fetch('/api/integrations/gmail/sync', { method: 'POST' })
      const syncData = await syncRes.json() as { error?: string }
      if (!syncRes.ok) throw new Error(syncData.error ?? 'Gmail sync failed')

      onConfigured()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gmail setup failed')
    } finally {
      setSaving(false)
    }
  }

  function toggleLabel(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  if (!mounted || !isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-red-500" />
                <h3 className="text-lg font-semibold text-gray-900">Gmail setup</h3>
              </div>
              <p className="text-sm text-gray-500 mt-1">Gmail is personal by default. Your emails stay private.</p>
            </div>
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
          </div>

          <div className="px-6 py-5">
            <div className="mb-5 flex items-center gap-2 text-xs text-gray-400">
              {['Connect', 'Labels', 'Filters', 'Review'].map((label, index) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] font-medium ${step >= index ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {index + 1}
                  </span>
                  <span className={step >= index ? 'text-gray-700' : ''}>{label}</span>
                  {index < 3 && <ChevronRight className="w-3 h-3 text-gray-300" />}
                </div>
              ))}
            </div>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
            {labelsError && <p className="mb-4 text-sm text-amber-600">{labelsError}</p>}

            {step === 0 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Neuron reads selected Gmail labels and turns important emails into private, searchable memory.
                </p>
                <p className="text-sm text-gray-600">
                  {connected
                    ? 'Your Gmail account is already connected. Continue to choose labels and filters.'
                    : 'Connect Gmail to continue. Neuron only requests read-only access.'}
                </p>
                <div className="flex justify-between">
                  <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Not now</button>
                  <button
                    onClick={() => {
                      if (!connected) {
                        window.location.href = '/api/integrations/gmail/connect'
                        return
                      }
                      setStep(1)
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                  >
                    {connected ? 'Continue' : 'Connect Gmail'}
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Choose labels</h4>
                <p className="text-sm text-gray-500">
                  Inbox and Sent are selected by default. Important, Starred, and custom labels are optional.
                </p>
                {labelsLoading && <p className="text-sm text-gray-500">Loading labels…</p>}
                {!labelsLoading && labels.length === 0 && !labelsError && (
                  <p className="text-sm text-gray-500">No labels returned yet. Reconnect Gmail if this persists.</p>
                )}
                <div className="grid gap-2 max-h-80 overflow-auto pr-1">
                  {labels.map((label) => {
                    const checked = selected.includes(label.id)
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => toggleLabel(label.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${checked ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{label.name}</p>
                            <p className="text-xs text-gray-500">{label.type} · {label.messageCount} messages · {label.unreadCount} unread</p>
                          </div>
                          <span className={`w-4 h-4 rounded-full border ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                            {checked ? <CheckCircle className="w-4 h-4 text-white" /> : null}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-500">
                  Selected: {selectedNames.length > 0 ? selectedNames.join(', ') : 'None'}
                </p>
                <div className="flex justify-between">
                  <button onClick={() => setStep(0)} className="text-sm text-gray-500 hover:text-gray-700">Back</button>
                  <button onClick={() => setStep(2)} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Next</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Filters</h4>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Sync from date</span>
                  <input
                    type="date"
                    value={syncFrom}
                    onChange={(e) => setSyncFrom(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Senders or domains to include</span>
                  <input
                    value={senderFilter}
                    onChange={(e) => setSenderFilter(e.target.value)}
                    placeholder="boss@company.com, @company.com"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Exclude senders or domains</span>
                  <input
                    value={excludeFilter}
                    onChange={(e) => setExcludeFilter(e.target.value)}
                    placeholder="promo@vendor.com, @updates.example"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Max messages to sync</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={maxMessages}
                    onChange={(e) => setMaxMessages(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex justify-between">
                  <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">Back</button>
                  <button onClick={() => setStep(3)} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Review</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Review</h4>
                <div className="space-y-3 text-sm text-gray-600">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Selected labels</p>
                    <p>{selectedNames.length > 0 ? selectedNames.join(', ') : 'None'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Privacy</p>
                      <p>Personal only</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Max messages</p>
                      <p>{maxMessages}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Filters</p>
                      <p>From {filtersPreview.syncFrom} · Include {filtersPreview.senderFilter} · Exclude {filtersPreview.excludeFilter}</p>
                    </div>
                    {estimatedMessages != null && (
                      <div className="col-span-2">
                        <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Estimated messages</p>
                        <p>{estimatedMessages.toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700">Back</button>
                  <button
                    onClick={() => void handleConfigureAndSync()}
                    disabled={saving || selected.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Start Gmail Sync
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
