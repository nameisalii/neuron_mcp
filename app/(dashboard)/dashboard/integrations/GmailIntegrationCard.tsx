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
}

interface GmailIntegrationCardProps {
  createdAt?: string | null
  lastSyncAt?: string | null
  metadata: GmailMetadata | null
  connected?: boolean
  autoOpenSetup?: boolean
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'

export default function GmailIntegrationCard({
  createdAt,
  lastSyncAt,
  metadata,
  connected: connectedProp,
  autoOpenSetup = false,
}: GmailIntegrationCardProps) {
  const [isOpen, setIsOpen] = useState(false)
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
              <p className="mt-0.5 text-xs text-muted">Sync selected emails into your private Neuron memory.</p>
            </div>
          </div>
          <StatusBadge connected={connected} />
        </div>

        {/* Body: metadata / messaging (grows so actions pin to the bottom) */}
        <div className="mt-5 flex-1 space-y-3 text-sm text-muted">
          {!connected && (
            <p>Neuron reads selected Gmail labels and turns important emails into private, searchable memory.</p>
          )}
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
                  />
                )}
                <button type="button" onClick={() => setIsOpen(true)} className={integrationActionClass}>
                  <Settings className="h-3.5 w-3.5" />
                  Configure
                </button>
              </div>
              <ResetLink resetType="gmail" />
            </>
          ) : (
            <button type="button" onClick={() => setIsOpen(true)} className={integrationConnectClass}>Connect</button>
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
      />
    </>
  )
}
