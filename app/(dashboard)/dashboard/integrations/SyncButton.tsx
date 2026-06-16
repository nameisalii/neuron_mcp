'use client'

import { useState } from 'react'
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
  resetType?: 'slack' | 'notion' | 'linear' | 'gmail'
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
  const knowledgeCreated = result?.knowledgeCreated ?? result?.extractedKnowledgeItems
  const syncSummary = result && !result.error
    ? knowledgeCreated != null && knowledgeCreated > 0
      ? `Created ${knowledgeCreated} knowledge item${knowledgeCreated === 1 ? '' : 's'}`
      : (result.knowledgeUpdated ?? 0) > 0
        ? `Updated ${result.knowledgeUpdated} knowledge item${result.knowledgeUpdated === 1 ? '' : 's'}`
      : (result.fetched ?? result.synced ?? result.importedThreads ?? result.issuesFound ?? result.pagesDeleted ?? 0) === 0
        ? 'Synced 0 items — no accessible data found'
        : result.message ?? 'Synced 0 items — no extractable knowledge found'
    : null

  return (
    <div className="flex flex-col items-start gap-1">
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
      {result && !result.error && (
        <div className="max-w-sm text-left">
          {syncSummary && <p className="text-xs font-medium text-gray-700">{syncSummary}</p>}
          {(() => {
            const total = result.issuesFound ?? result.synced ?? result.importedThreads ?? result.imported ?? result.deleted ?? 0
            return (
              <p className="text-xs text-gray-500">
                {result.fetched != null && `${result.fetched} fetched · `}
                {result.processed != null && `${result.processed} processed · `}
                {result.knowledgeCreated != null && `${result.knowledgeCreated} created · `}
                {result.knowledgeUpdated != null && `${result.knowledgeUpdated} updated · `}
                {result.chunksExtracted != null && `${result.chunksExtracted} chunks extracted · `}
                {result.importedThreads != null && `${result.importedThreads} threads · `}
                {result.importedChunks != null && `${result.importedChunks} chunks · `}
                {result.chunksEmbedded != null && `${result.chunksEmbedded} chunks embedded · `}
                {result.aiExtractedKnowledgeItems != null && `${result.aiExtractedKnowledgeItems} AI extracted · `}
                {result.fallbackKnowledgeItems != null && `${result.fallbackKnowledgeItems} fallback · `}
                {result.extractedKnowledgeItems != null && `${result.extractedKnowledgeItems} total memory items · `}
                {result.imported != null && `${result.imported} imported · `}
                {result.updated != null && `${result.updated} updated · `}
                {result.skipped != null && `${result.skipped} skipped · `}
                {result.deleted != null && `${result.deleted} deleted · `}
                {total} {resultLabel} · {result.extracted ?? 0} extracted
                {result.teamsScanned != null && ` · ${result.teamsScanned} teams`}
                {result.labelsScanned != null && ` · ${result.labelsScanned} labels`}
                {result.extractionEmbeddingErrors != null && result.extractionEmbeddingErrors > 0 && ` · ${result.extractionEmbeddingErrors} extraction errors`}
                {result.namespaceUsed && ` · ${result.namespaceUsed}`}
                {result.conflicts != null && result.conflicts > 0 && ` · ${result.conflicts} conflicts`}
              </p>
            )
          })()}
          {result.message && <p className="text-xs text-amber-600">{result.message}</p>}
          {gmailNeedsReconfigure && onNeedsReconfigure && (
            <button
              type="button"
              onClick={onNeedsReconfigure}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Change Gmail filters
            </button>
          )}
          {result.lastSyncedAt && <p className="text-xs text-gray-400">Last synced {new Date(result.lastSyncedAt).toLocaleString()}</p>}
          {(result.gmailQueryUsed || result.selectedLabels || result.labelIdsUsed || result.messagesFoundBeforeFiltering != null) && (
            <p className="text-xs text-gray-400 break-words">
              {result.selectedLabels?.length ? `Labels: ${result.selectedLabels.join(', ')}` : null}
              {result.labelIdsUsed?.length ? `${result.selectedLabels?.length ? ' · ' : ''}Label IDs: ${result.labelIdsUsed.join(', ')}` : null}
              {result.gmailQueryUsed ? `${result.selectedLabels?.length || result.labelIdsUsed?.length ? ' · ' : ''}Query: ${result.gmailQueryUsed}` : null}
              {result.messagesFoundBeforeFiltering != null ? ` · Found: ${result.messagesFoundBeforeFiltering}` : null}
              {result.messagesFetched != null ? ` · Fetched: ${result.messagesFetched}` : null}
              {result.threadsCreated != null ? ` · Threads: ${result.threadsCreated}` : null}
              {result.chunksCreated != null ? ` · Chunks: ${result.chunksCreated}` : null}
              {result.skippedReasons && Object.keys(result.skippedReasons).length > 0
                ? ` · Skips: ${Object.entries(result.skippedReasons).map(([key, value]) => `${key}:${value}`).join(', ')}`
                : null}
              {result.extractionDiagnostics && Object.values(result.extractionDiagnostics).some((value) => value > 0)
                ? ` · Extraction: ${Object.entries(result.extractionDiagnostics).filter(([, value]) => value > 0).map(([key, value]) => `${key}:${value}`).join(', ')}`
                : null}
              {result.configuredSyncFrom ? ` · Configured sync from: ${result.configuredSyncFrom}` : null}
              {result.effectiveQueryStart ? ` · Effective query start: ${result.effectiveQueryStart}` : null}
              {result.lastSyncAttemptAt ? ` · Last attempt: ${result.lastSyncAttemptAt}` : null}
              {result.lastSuccessfulImportAt ? ` · Last successful import: ${result.lastSuccessfulImportAt}` : null}
              {result.canReadMailbox != null ? ` · Mailbox readable: ${result.canReadMailbox ? 'yes' : 'no'}` : null}
              {result.recentMessagesAvailable != null ? ` · Recent: ${result.recentMessagesAvailable}` : null}
              {result.inboxMessagesAvailable != null ? ` · Inbox: ${result.inboxMessagesAvailable}` : null}
              {result.sentMessagesAvailable != null ? ` · Sent: ${result.sentMessagesAvailable}` : null}
              {result.namespaceUsed ? ` · ${result.namespaceUsed}` : null}
            </p>
          )}
        </div>
      )}
      {result?.error && (
        <p className="text-xs text-red-600">{result.error}</p>
      )}
    </div>
  )
}
