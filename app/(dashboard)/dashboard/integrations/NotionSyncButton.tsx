'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface SyncResult {
  success?: boolean
  fetched?: number
  knowledgeCreated?: number
  knowledgeUpdated?: number
  pagesProcessed?: number
  chunksCreated?: number
  message?: string
  syncedBy?: string
  error?: string
}

export default function NotionSyncButton({ workspaceId, label = 'Sync Now' }: { workspaceId?: string; label?: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const router = useRouter()

  async function handleSync() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/integrations/notion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json() as SyncResult
      setResult(data)
      if (data.success) router.refresh()
    } catch {
      setResult({ error: 'Sync failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Syncing…' : label}
      </button>
      {result?.success && (
        <div className="text-right">
          <p className="text-xs font-medium text-gray-700">
            {(result.knowledgeCreated ?? 0) > 0
              ? `Created ${result.knowledgeCreated} knowledge item${result.knowledgeCreated === 1 ? '' : 's'}`
              : (result.fetched ?? 0) === 0
                ? 'Synced 0 items — no accessible data found'
                : result.message ?? 'Synced 0 items — no extractable knowledge found'}
          </p>
          <p className="text-xs text-gray-500">
            {result.pagesProcessed} pages · {result.chunksCreated} chunks
            {result.knowledgeUpdated ? ` · ${result.knowledgeUpdated} updated` : ''}
          </p>
        </div>
      )}
      {result?.error && (
        <p className="text-xs text-red-600">{result.error}</p>
      )}
    </div>
  )
}
