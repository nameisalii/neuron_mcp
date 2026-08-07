'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import GmailSetupModal from './GmailSetupModal'
import {
  StatusBadge,
  ResetLink,
  IntegrationViewLink,
  DisconnectIntegrationButton,
  integrationActionClass,
  integrationConnectClass,
} from './IntegrationCardUi'

export type GmailMetadata = {
  status?: string
  configured?: boolean
  privacy?: 'personal'
  selectedLabels?: string[]
  selectedLabelNames?: string[]
  timeWindow?: number
  syncFrom?: string | null
  senderFilter?: string[]
  excludeFilter?: string[]
  maxMessages?: number
  lastSuccessfulImportAt?: string
  lastSyncStatus?: 'completed' | 'partial' | 'failed'
  lastSyncStats?: {
    processed: number
    created: number
    skippedDuplicates: number
    failed: number
    hasMore: boolean
  }
  backfillCursor?: unknown
  backfillStatus?: string
}

interface GmailIntegrationCardProps {
  createdAt?: string | null
  lastSyncAt?: string | null
  metadata: GmailMetadata | null
  connected?: boolean
  autoOpenSetup?: boolean
  oauthBlocked?: boolean
  available?: boolean
  missingEnv?: string[]
  betaGated?: boolean
  betaUser?: boolean
  backfillEnabled?: boolean
  allowAllHistory?: boolean
  archivedSyncEnabled?: boolean
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'

export default function GmailIntegrationCard({
  createdAt,
  lastSyncAt,
  metadata,
  connected: connectedProp,
  autoOpenSetup = false,
  oauthBlocked = false,
  available = true,
  missingEnv = [],
  betaGated = false,
  betaUser = false,
  backfillEnabled = true,
  allowAllHistory = false,
  archivedSyncEnabled = false,
}: GmailIntegrationCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [backfillDays, setBackfillDays] = useState('90')
  const [includeArchived, setIncludeArchived] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!autoOpenSetup) return
    setIsOpen(true)
    window.history.replaceState(null, '', '/dashboard/integrations')
  }, [autoOpenSetup])

  const connected = connectedProp ?? Boolean(metadata)
  const configured = Boolean(metadata?.configured && (metadata.selectedLabels?.length ?? 0) > 0)
  const selectedLabelSummary = useMemo(() => {
    const labels = metadata?.selectedLabelNames?.length
      ? metadata.selectedLabelNames
      : metadata?.selectedLabels ?? []
    return labels.slice(0, 4).join(', ')
  }, [metadata])

  return (
    <>
      <Card padding="md" className="flex h-full flex-col">
        {/* Header: logo + name (left), status badge (right) */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <BrandTile brand="gmail" className="h-12 w-12" />
            <div className="min-w-0">
              <h3 className="text-lg font-display font-semibold text-ink">Gmail</h3>
              <p className="mt-0.5 text-xs text-muted">Connect Gmail so Neuron can search and summarize your email context.</p>
            </div>
          </div>
          {connected ? <StatusBadge connected /> : (
            <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-sm font-medium ${available ? 'bg-[#E6F2EC] text-positive' : 'bg-amber-50 text-amber-800'}`}>
              {available ? (betaGated ? 'Beta access' : 'Available') : (betaGated ? 'Beta' : 'Setup needed')}
            </span>
          )}
        </div>

        {/* Body: metadata / messaging (grows so actions pin to the bottom) */}
        <div className="mt-5 flex-1 space-y-3 text-sm text-muted">
          {!connected && (
            <p>Neuron uses Gmail read-only access. It cannot send, modify, archive, label, or delete emails.</p>
          )}
          {!connected && betaGated && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><p className="font-medium">Gmail is available to approved beta users while Google restricted-scope verification is finishing.</p>{!betaUser && <p className="mt-1">Your account is not currently on the approved beta list.</p>}</div>}
          {!connected && !betaGated && !available && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><p className="font-medium">Gmail setup is incomplete.</p><p className="mt-1">Missing configuration: {missingEnv.join(', ') || 'Gmail is disabled'}</p></div>}
          {oauthBlocked && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><p className="font-medium">Gmail connection failed. Check the safe error above and try again.</p><button type="button" onClick={() => setIsOpen(true)} className="mt-2 underline underline-offset-2">View setup help</button></div>}
          {connected && !configured && (
            <p>Choose labels before syncing. Gmail stays personal by default.</p>
          )}
          {connected && configured && (
            <div className="grid grid-cols-2 gap-3">
              <div className={statTileClass}>
                <p className="mb-0.5 text-xs text-muted">Last synced</p>
                <p className="font-medium text-ink">{lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Never'}</p>
              </div>
              <div className={statTileClass}>
                <p className="mb-0.5 text-xs text-muted">Privacy</p>
                <p className="font-medium text-ink">Personal</p>
              </div>
              <div className={`${statTileClass} col-span-2`}>
                <p className="mb-0.5 text-xs text-muted">Labels</p>
                <p className="font-medium text-ink">{selectedLabelSummary || 'Configured labels'}</p>
              </div>
              {metadata?.lastSyncStats && (
                <div className={`${statTileClass} col-span-2`} data-testid="gmail-sync-stats">
                  <p className="mb-0.5 text-xs text-muted">Last sync results</p>
                  <p className="font-medium text-ink">Processed {metadata.lastSyncStats.processed}, created {metadata.lastSyncStats.created}, skipped duplicates {metadata.lastSyncStats.skippedDuplicates}, failed {metadata.lastSyncStats.failed}</p>
                  {(metadata.lastSyncStatus === 'partial' || metadata.lastSyncStats.failed > 0) && <p className="mt-1 text-xs text-amber-700">Gmail sync completed partially. Some emails were skipped or failed. View details.</p>}
                </div>
              )}
              {backfillEnabled && (
                <div className={`${statTileClass} col-span-2 space-y-2`}>
                  <label className="block text-xs text-muted" htmlFor="gmail-backfill-range">Backfill history</label>
                  <select id="gmail-backfill-range" value={backfillDays} onChange={(event) => setBackfillDays(event.target.value)} className="w-full rounded-lg border border-warm bg-white px-3 py-2 text-sm text-ink">
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last 1 year</option>
                    {allowAllHistory && <option value="all">All available history</option>}
                  </select>
                  {archivedSyncEnabled && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Include archived emails</label>}
                  <p className="text-xs text-muted">Large Gmail backfills can take multiple runs due to API and processing limits.</p>
                </div>
              )}
            </div>
          )}
          {connected && createdAt && (
            <p className="text-xs text-muted/80">Connected {new Date(createdAt).toLocaleDateString()}</p>
          )}
        </div>

        {/* Actions: primary/secondary buttons (left), reset link (right) */}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
          {connected ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <IntegrationViewLink href="/dashboard/integrations/gmail" />
                {configured && (
                  <SyncButton
                    endpoint="/api/integrations/gmail/sync"
                    resultLabel="threads"
                    hideReset
                    onNeedsReconfigure={() => setIsOpen(true)}
                    requestBody={{ mode: 'recent' }}
                    label="Sync recent emails"
                  />
                )}
                {configured && backfillEnabled && (
                  <SyncButton endpoint="/api/integrations/gmail/backfill" resultLabel="emails" hideReset requestBody={{ lookbackDays: backfillDays === 'all' ? null : Number(backfillDays), includeArchived }} label={metadata?.backfillCursor ? 'Continue backfill' : 'Backfill history'} />
                )}
                <button type="button" onClick={() => setIsOpen(true)} className={integrationActionClass}>
                  <Settings className="h-3.5 w-3.5" />
                  Configure
                </button>
                <DisconnectIntegrationButton type="gmail" />
              </div>
              <ResetLink resetType="gmail" />
            </>
          ) : (
            <button type="button" onClick={() => setIsOpen(true)} className={integrationConnectClass} disabled={!available}>Connect Gmail</button>
          )}
        </div>
      </Card>

      <GmailSetupModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfigured={() => {
          setIsOpen(false)
          router.refresh()
        }}
        connected={connected}
        initialStep={connected ? 1 : 0}
        metadata={metadata}
        oauthBlocked={oauthBlocked}
      />
    </>
  )
}
