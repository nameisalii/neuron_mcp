'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import GmailSetupModal from './GmailSetupModal'
import {
  ConnectedBadge,
  IntegrationViewLink,
  NotConnectedBadge,
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
  autoOpenSetup?: boolean
}

export default function GmailIntegrationCard({
  createdAt,
  lastSyncAt,
  metadata,
  autoOpenSetup = false,
}: GmailIntegrationCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!autoOpenSetup) return
    setIsOpen(true)
    window.history.replaceState(null, '', '/dashboard/integrations')
  }, [autoOpenSetup])

  const connected = Boolean(metadata)
  const configured = Boolean(metadata?.configured && (metadata.selectedLabels?.length ?? 0) > 0)
  const selectedLabelSummary = useMemo(() => {
    const labels = metadata?.selectedLabelNames?.length
      ? metadata.selectedLabelNames
      : metadata?.selectedLabels ?? []
    return labels.slice(0, 4).join(', ')
  }, [metadata])

  return (
    <>
      <Card padding="md">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3.5">
            <BrandTile brand="gmail" className="h-12 w-12" />
            <div className="min-w-0">
              <h3 className="text-lg font-display font-semibold text-ink">Gmail</h3>
              <p className="mt-0.5 text-xs text-muted">Sync selected emails into your private Neuron memory.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {connected ? (
              <>
                <IntegrationViewLink href="/dashboard/integrations/gmail" />
                {configured ? (
                  <SyncButton endpoint="/api/integrations/gmail/sync" showReset resetType="gmail" resultLabel="threads" onNeedsReconfigure={() => setIsOpen(true)} />
                ) : (
                  <SyncButton endpoint="/api/integrations/gmail/sync" showReset resetType="gmail" resultLabel="threads" syncEnabled={false} onNeedsReconfigure={() => setIsOpen(true)} />
                )}
                <ConnectedBadge />
              </>
            ) : (
              <>
                <button type="button" onClick={() => setIsOpen(true)} className={integrationConnectClass}>Connect</button>
                <NotConnectedBadge />
              </>
            )}
          </div>
        </div>

        <div className="space-y-3 text-sm text-gray-600">
          {!connected && (
            <p>Neuron reads selected Gmail labels and turns important emails into private, searchable memory.</p>
          )}
          {connected && !configured && (
            <p>Choose labels before syncing. Gmail stays personal by default.</p>
          )}
          {connected && configured && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Last synced</p>
                <p className="font-medium text-gray-700">{lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Never'}</p>
              </div>
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Privacy</p>
                <p className="font-medium text-gray-700">Personal</p>
              </div>
              <div className="bg-gray-50 rounded-md px-3 py-2 col-span-2">
                <p className="text-xs text-gray-400 mb-0.5">Labels</p>
                <p className="font-medium text-gray-700">{selectedLabelSummary || 'Configured labels'}</p>
              </div>
            </div>
          )}

          {connected && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={integrationActionClass}
              >
                <Settings className="h-3.5 w-3.5" />
                Configure Gmail
              </button>
            </div>
          )}

          {connected && createdAt && (
            <div className="text-xs text-gray-400">
              Connected {new Date(createdAt).toLocaleDateString()}
            </div>
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
