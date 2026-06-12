'use client'

import { useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'

interface SyncResult {
  synced: number
  extracted: number
  conflicts?: number
  deleted?: number
  error?: string
}

interface SyncButtonProps {
  endpoint: string
  showReset?: boolean
  resultLabel?: string
}

export default function SyncButton({ endpoint, showReset = false, resultLabel = 'items' }: SyncButtonProps) {
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)

  async function handleSync() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json() as SyncResult
      setResult(data)
    } catch {
      setResult({ synced: 0, extracted: 0, error: 'Sync failed' })
    } finally {
      setLoading(false)
    }
  }

  async function handleResetAndReindex() {
    setResetting(true)
    setResult(null)
    try {
      const res = await fetch('/api/debug/reset-and-reindex', { method: 'POST' })
      const data = await res.json() as SyncResult
      setResult(data)
    } catch {
      setResult({ synced: 0, extracted: 0, error: 'Reset failed' })
    } finally {
      setResetting(false)
    }
  }

  const busy = loading || resetting

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {showReset && (
          <button
            onClick={handleResetAndReindex}
            disabled={busy}
            title="Wipe Pinecone + DB and re-sync from scratch"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className={`w-3.5 h-3.5 ${resetting ? 'animate-pulse' : ''}`} />
            {resetting ? 'Resetting…' : 'Nuclear Reset'}
          </button>
        )}
        <button
          onClick={handleSync}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
      {result && !result.error && (
        <p className="text-xs text-gray-500">
          {result.deleted != null && `${result.deleted} deleted · `}
          {result.synced} {resultLabel} · {result.extracted} extracted
          {result.conflicts != null && result.conflicts > 0 && ` · ${result.conflicts} conflicts`}
        </p>
      )}
      {result?.error && (
        <p className="text-xs text-red-600">{result.error}</p>
      )}
    </div>
  )
}
