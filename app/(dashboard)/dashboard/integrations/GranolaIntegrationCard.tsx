'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import GranolaSetupModal from './GranolaSetupModal'
import {
  StatusBadge,
  ResetLink,
  IntegrationViewLink,
  integrationActionClass,
  integrationConnectClass,
} from './IntegrationCardUi'

interface GranolaIntegrationCardProps {
  createdAt?: string | null
  lastSyncAt?: string | null
  connected?: boolean
  autoOpenSetup?: boolean
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'

export default function GranolaIntegrationCard({
  createdAt,
  lastSyncAt,
  connected = false,
  autoOpenSetup = false,
}: GranolaIntegrationCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!autoOpenSetup) return
    setIsOpen(true)
    window.history.replaceState(null, '', '/dashboard/integrations')
  }, [autoOpenSetup])

  return (
    <>
      <Card padding="md" className="flex h-full flex-col">
        {/* Header: logo + name (left), status badge (right) */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <BrandTile brand="granola" className="h-12 w-12" />
            <div className="min-w-0">
              <h3 className="text-lg font-display font-semibold text-ink">Granola</h3>
              <p className="mt-0.5 text-xs text-muted">
                {connected ? 'Connected — meeting notes synced to knowledge base' : 'Sync meeting notes from Granola'}
              </p>
            </div>
          </div>
          <StatusBadge connected={connected} />
        </div>

        {/* Body */}
        <div className="mt-5 flex-1 space-y-3 text-sm text-muted">
          {connected ? (
            <div className="grid grid-cols-2 gap-3">
              <div className={statTileClass}>
                <p className="mb-0.5 text-xs text-muted">Connected</p>
                <p className="font-medium text-ink">{createdAt ? new Date(createdAt).toLocaleDateString() : '—'}</p>
              </div>
              <div className={statTileClass}>
                <p className="mb-0.5 text-xs text-muted">Last synced</p>
                <p className="font-medium text-ink">{lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Never'}</p>
              </div>
            </div>
          ) : (
            <p>Sync meeting notes, decisions, action items, and customer feedback from Granola.</p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
          {connected ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <IntegrationViewLink href="/dashboard/integrations/granola" />
                <SyncButton endpoint="/api/integrations/granola/sync" resultLabel="notes" hideReset />
                <button type="button" onClick={() => setIsOpen(true)} className={integrationActionClass}>
                  <Settings className="h-3.5 w-3.5" />
                  Configure
                </button>
              </div>
              <ResetLink resetType="granola" />
            </>
          ) : (
            <button type="button" onClick={() => setIsOpen(true)} className={integrationConnectClass}>Connect</button>
          )}
        </div>
      </Card>

      <GranolaSetupModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfigured={() => {
          setIsOpen(false)
          router.refresh()
        }}
        connected={connected}
      />
    </>
  )
}
