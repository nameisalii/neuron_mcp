'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { integrationPrimaryClass, integrationResetClass } from './IntegrationCardUi'

interface SyncResult {
  success?: boolean
  fetched?: number
  processed?: number
  knowledgeCreated?: number
  knowledgeUpdated?: number
  chunksExtracted?: number
  extractionEmbeddingErrors?: number
  extractionErrors?: number
  embeddingErrors?: number
  databaseErrors?: number
  synced?: number
  extracted?: number
  imported?: number
  importedThreads?: number
  importedChunks?: number
  extractedKnowledgeItems?: number
  aiExtractedKnowledgeItems?: number
  fallbackKnowledgeItems?: number
  chunksEmbedded?: number
  extractionDiagnostics?: Record<string, number>
  updated?: number
  skipped?: number
  conflicts?: number
  deleted?: number
  issuesFound?: number
  teamsScanned?: number
  labelsScanned?: number
  selectedLabels?: string[]
  labelIdsUsed?: string[]
  gmailQueryUsed?: string | null
  messagesFoundBeforeFiltering?: number
  messagesFetched?: number
  threadsCreated?: number
  chunksCreated?: number
  skippedReasons?: Record<string, number>
  syncFrom?: string | null
  configuredSyncFrom?: string | null
  effectiveQueryStart?: string | null
  lastSyncAtBeforeRun?: string | null
  lastSyncAtAfterRun?: string | null
  lastSyncAttemptAt?: string | null
  lastSuccessfulImportAt?: string | null
  namespaceUsed?: string | null
  canReadMailbox?: boolean | null
  recentMessagesAvailable?: number | null
  inboxMessagesAvailable?: number | null
  sentMessagesAvailable?: number | null
  diagnosticRecentCount?: number | null
  diagnosticInboxCount?: number | null
  diagnosticSentCount?: number | null
  lastSyncedAt?: string | null
  message?: string
  error?: string
  pagesDeleted?: number
  chunksDeleted?: number
}

interface SyncButtonProps {
  endpoint: string
  showReset?: boolean
  resetType?: 'slack' | 'notion' | 'linear' | 'gmail' | 'granola' | 'discord' | 'telegram' | 'teams' | 'jira' | 'whatsapp'
  resultLabel?: string
  requestBody?: Record<string, unknown>
  syncEnabled?: boolean
  hideReset?: boolean
  onNeedsReconfigure?: () => void
}

export default function SyncButton({ endpoint, showReset = false, resetType, resultLabel = 'items', requestBody, syncEnabled = true, hideReset = false, onNeedsReconfigure }: SyncButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [statusHost, setStatusHost] = useState<HTMLSpanElement | null>(null)

  useEffect(() => {
    const actionRow = rootRef.current?.parentElement
    if (!actionRow) return
    const host = document.createElement('span')
    host.className = 'inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-left'
    host.dataset.syncStatusHost = 'true'
    actionRow.appendChild(host)
    setStatusHost(host)
    return () => {
      setStatusHost(null)
      host.remove()
    }
  }, [])

  async function handleSync() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        ...(requestBody ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) } : {}),
      })
      const data = await res.json() as SyncResult
      setResult(data)
      if (res.ok) router.refresh()
    } catch {
      setResult({ success: false, synced: 0, extracted: 0, error: 'Sync failed' })
    } finally {
      setLoading(false)
    }
  }

  async function handleResetAndReindex() {
    if (!resetType) return
    const resetLabel = resetType.charAt(0).toUpperCase() + resetType.slice(1)
    const confirmed = window.confirm(
      `Reset all ${resetLabel} data? This removes only ${resetLabel} knowledge and embeddings. Other integrations are not affected.`,
    )
    if (!confirmed) return
    setResetting(true)
    setResult(null)
    try {
      const resetEndpoint = resetType === 'gmail' ? '/api/integrations/gmail/reset' : `/api/integrations/${resetType}/reset`
      const res = await fetch(resetEndpoint, { method: 'POST' })
      const data = await res.json() as SyncResult
      setResult(data)
      if (res.ok) router.refresh()
    } catch {
      setResult({ success: false, synced: 0, extracted: 0, error: 'Reset failed' })
    } finally {
      setResetting(false)
    }
  }

  const busy = loading || resetting
  const gmailNeedsReconfigure = result?.importedThreads === 0
    && result.canReadMailbox === true
    && ((result.inboxMessagesAvailable ?? 0) > 0 || (result.sentMessagesAvailable ?? 0) > 0)

  function normalizedSyncMessage(syncResult: SyncResult | null) {
    if (!syncResult || syncResult.error) return null
    const created = syncResult.knowledgeCreated
      ?? syncResult.extractedKnowledgeItems
      ?? syncResult.imported
      ?? syncResult.importedThreads
      ?? syncResult.synced
      ?? syncResult.pagesDeleted
      ?? 0
    const updated = syncResult.knowledgeUpdated ?? syncResult.updated ?? 0
    const fetched = syncResult.fetched
      ?? syncResult.messagesFetched
      ?? syncResult.messagesFoundBeforeFiltering
      ?? syncResult.issuesFound
      ?? syncResult.synced
      ?? 0
    const hasErrors = (syncResult.extractionEmbeddingErrors ?? 0) > 0
      || (syncResult.extractionErrors ?? 0) > 0
      || (syncResult.embeddingErrors ?? 0) > 0
      || (syncResult.databaseErrors ?? 0) > 0

    if (hasErrors) return 'Sync completed with some skipped items.'
    if (created > 0 || updated > 0) return 'Sync complete.'
    if (fetched === 0) return 'No new items found.'
    return 'Sync complete.'
  }

  function normalizedErrorMessage(syncResult: SyncResult | null) {
    const raw = syncResult?.error ?? syncResult?.message ?? ''
    if (/setup|configure|configured|credential|connect|auth|token|scope|permission|consent/i.test(raw)) {
      return 'Connection needs setup.'
    }
    if (resetting) return 'Reset failed. Try again.'
    return 'Sync failed. Try again.'
  }

  const status = (
    <span aria-live="polite" className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1">
      {loading && <span className="text-xs font-medium text-gray-500">Syncing integration…</span>}
      {resetting && <span className="text-xs font-medium text-gray-500">Resetting integration…</span>}
      {result && !result.error && (
        <>
          <span className="whitespace-normal text-xs font-medium text-gray-500 sm:whitespace-nowrap">{normalizedSyncMessage(result)}</span>
          {gmailNeedsReconfigure && onNeedsReconfigure && (
            <button type="button" onClick={onNeedsReconfigure} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Change Gmail filters</button>
          )}
          {result.lastSyncedAt && <span className="text-xs text-gray-400">Last synced {new Date(result.lastSyncedAt).toLocaleString()}</span>}
        </>
      )}
      {result?.error && <span className="whitespace-normal text-xs font-medium text-red-600 sm:whitespace-nowrap">{normalizedErrorMessage(result)}</span>}
    </span>
  )

  return (
    <div ref={rootRef} className="flex items-center gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={syncEnabled ? handleSync : onNeedsReconfigure}
          disabled={busy || (!syncEnabled && !onNeedsReconfigure)}
          className={integrationPrimaryClass}
          title={!syncEnabled ? 'Finish setup before syncing' : undefined}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Syncing…' : 'Sync Now'}
        </button>
        {showReset && resetType && !hideReset && (
          <button
            onClick={handleResetAndReindex}
            disabled={busy}
            title={`Remove only ${resetType.charAt(0).toUpperCase() + resetType.slice(1)} data and embeddings`}
            className={integrationResetClass}
          >
            <Trash2 className={`w-3.5 h-3.5 ${resetting ? 'animate-pulse' : ''}`} />
            {resetting ? 'Resetting…' : 'Nuclear Reset'}
          </button>
        )}
      </div>
      {statusHost && createPortal(status, statusHost)}
    </div>
  )
}
