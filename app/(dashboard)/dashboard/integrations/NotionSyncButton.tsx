'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface SyncResult {
  success?: boolean
  pagesProcessed?: number
  chunksCreated?: number
  syncedBy?: string
  error?: string
}

export default function NotionSyncButton({ workspaceId }: { workspaceId?: string }) {
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
        {loading ? 'Syncing…' : 'Sync Now'}
      </button>
      {result?.success && (
        <p className="text-xs text-gray-500">
          {result.pagesProcessed} pages · {result.chunksCreated} chunks
        </p>
      )}
      {result?.error && (
        <p className="text-xs text-red-600">{result.error}</p>
      )}
    </div>
  )
}
