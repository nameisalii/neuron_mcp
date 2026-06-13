'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import NotionSetupModal from './NotionSetupModal'
import {
  ConnectedBadge,
  IntegrationViewLink,
  NotConnectedBadge,
  integrationConnectClass,
} from './IntegrationCardUi'

interface NotionIntegrationCardProps {
  connected: boolean
  workspaceId?: string
  pageCount: number
  lastSyncedLabel: string
  syncedByName?: string | null
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'

export default function NotionIntegrationCard({
  connected,
  workspaceId,
  pageCount,
  lastSyncedLabel,
  syncedByName,
}: NotionIntegrationCardProps) {
  const router = useRouter()
  const [guideOpen, setGuideOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  async function continueToNotion() {
    setConnecting(true)
    setConnectError('')
    try {
      const response = await fetch('/api/integrations/notion/connect', {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Could not connect Notion')
      setGuideOpen(false)
      router.refresh()
    } catch {
      setConnectError('Could not connect Notion. Check that pages are shared, then try again.')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <>
      <Card padding="md">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3.5">
            <BrandTile brand="notion" className="h-12 w-12" />
            <div className="min-w-0">
              <h3 className="text-lg font-display font-semibold text-ink">Notion</h3>
              <p className="mt-0.5 text-xs text-muted">
                {connected ? 'Pages synced to your knowledge base' : 'Connect Notion and choose the pages Neuron can read.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {connected ? (
              <>
                <IntegrationViewLink href="/dashboard/integrations/notion" />
                <SyncButton endpoint="/api/integrations/notion/sync" requestBody={{ workspaceId }} showReset resetType="notion" resultLabel="pages" />
                <ConnectedBadge />
              </>
            ) : (
              <>
                <button type="button" onClick={() => setGuideOpen(true)} className={integrationConnectClass}>
                  Connect
                </button>
                <NotConnectedBadge />
              </>
            )}
          </div>
        </div>

        {connected ? (
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className={statTileClass}>
                <p className="mb-0.5 text-xs text-muted">Pages synced</p>
                <p className="text-base font-semibold text-ink">{pageCount}</p>
              </div>
              <div className={statTileClass}>
                <p className="mb-0.5 text-xs text-muted">Last synced</p>
                <p className="text-xs font-medium leading-tight text-ink">{lastSyncedLabel}</p>
              </div>
              <div className={statTileClass}>
                <p className="mb-0.5 text-xs text-muted">Synced by</p>
                <p className="truncate text-xs font-medium leading-tight text-ink">{syncedByName ?? '—'}</p>
              </div>
            </div>
            {pageCount === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-900">Notion is connected. Click Sync Now to import your selected pages.</p>
                <p className="mt-1 text-xs text-amber-800">No Notion pages were found. Open Notion, share pages with the Neuron integration, then sync again.</p>
              </div>
            )}
            <button type="button" onClick={() => setGuideOpen(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              View setup guide
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Neuron reads only the Notion pages you share and turns them into searchable rules, decisions, ideas, processes, and facts.
          </p>
        )}
        {connectError && <p className="mt-3 text-xs text-red-600">{connectError}</p>}
      </Card>

      <NotionSetupModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        onContinue={continueToNotion}
        continuing={connecting}
      />
    </>
  )
}
