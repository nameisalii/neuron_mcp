'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import WhatsAppSetupModal from './WhatsAppSetupModal'
import {
  StatusBadge,
  ResetLink,
  IntegrationViewLink,
  integrationActionClass,
  integrationConnectClass,
} from './IntegrationCardUi'

interface WhatsAppIntegrationCardProps {
  connected: boolean
  teamName?: string | null
  createdAt?: string | null
  lastSyncAt?: string | null
  autoOpenSetup?: boolean
}

const statTileClass = 'bg-cream rounded-xl px-3.5 py-2.5 border border-warm/60'

export default function WhatsAppIntegrationCard({
  connected,
  teamName,
  createdAt,
  lastSyncAt,
  autoOpenSetup = false,
}: WhatsAppIntegrationCardProps) {
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
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <BrandTile brand="whatsapp" className="h-12 w-12" />
            <div className="min-w-0">
              <h3 className="text-lg font-display font-semibold text-ink">WhatsApp Business</h3>
              <p className="text-xs text-muted mt-0.5 truncate">
                {connected ? `Connected to ${teamName ?? 'your business number'}` : 'Import inbound WhatsApp customer messages'}
              </p>
            </div>
          </div>
          <StatusBadge connected={connected} />
        </div>

        <div className="mt-5 flex-1 text-sm text-muted">
          {connected ? (
            <div className="grid grid-cols-2 gap-3">
              <div className={statTileClass}>
                <p className="text-xs text-muted mb-0.5">Connected</p>
                <p className="font-medium text-ink">{createdAt ? new Date(createdAt).toLocaleDateString() : '-'}</p>
              </div>
              <div className={statTileClass}>
                <p className="text-xs text-muted mb-0.5">Last message</p>
                <p className="font-medium text-ink">{lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Waiting'}</p>
              </div>
            </div>
          ) : (
            <p>
              Connect WhatsApp Cloud API webhooks so Neuron can extract decisions, requests, and customer context from inbound messages.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
          {connected ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <IntegrationViewLink href="/dashboard/integrations/whatsapp" />
                <SyncButton endpoint="/api/integrations/whatsapp/sync" resultLabel="messages" hideReset />
                <button type="button" onClick={() => setIsOpen(true)} className={integrationActionClass}>
                  <Settings className="h-3.5 w-3.5" />
                  Configure
                </button>
              </div>
              <ResetLink resetType="whatsapp" />
            </>
          ) : (
            <button type="button" onClick={() => setIsOpen(true)} className={integrationConnectClass}>Connect</button>
          )}
        </div>
      </Card>

      <WhatsAppSetupModal
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
