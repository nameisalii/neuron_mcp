'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import NotionSetupModal from './NotionSetupModal'
import {
  StatusBadge,
  ResetLink,
  IntegrationViewLink,
  integrationConnectClass,
} from './IntegrationCardUi'

interface NotionIntegrationCardProps {
  connected: boolean
  workspaceId?: string
  pageCount: number
  hasSynced?: boolean
  lastSyncedLabel: string
  syncedByName?: string | null
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'

export default function NotionIntegrationCard({
  connected,
  workspaceId,
  pageCount,
  hasSynced = false,
  lastSyncedLabel,
  syncedByName,
}: NotionIntegrationCardProps) {
  const [guideOpen, setGuideOpen] = useState(false)

  return (
    <>
      <Card padding="md" className="flex h-full flex-col">
        {/* Header: logo + name (left), status badge (right) */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <BrandTile brand="notion" className="h-10 w-10" />
            <div className="min-w-0">
              <h3 className="text-lg font-display font-semibold text-ink">Notion</h3>
              <p className="mt-0.5 text-xs text-muted">
                {connected ? 'Pages synced to your knowledge base' : 'Connect Notion and choose the pages Neuron can read.'}
              </p>
            </div>
          </div>
          <StatusBadge connected={connected} />
        </div>

        {/* Body: stats / messaging (grows so actions pin to the bottom) */}
        <div className="mt-5 flex-1 text-sm text-muted">
          {connected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  {hasSynced && (
                    <p className="mt-1 text-xs text-amber-800">No Notion pages were found. Open Notion, share pages with the Neuron integration, then sync again.</p>
                  )}
                </div>
              )}
              <button type="button" onClick={() => setGuideOpen(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                View setup guide
              </button>
            </div>
          ) : (
            <p>
              Neuron reads only the Notion pages you share and turns them into searchable rules, decisions, ideas, processes, and facts.
            </p>
          )}
        </div>

        {/* Actions: primary/secondary buttons (left), reset link (right) */}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
          {connected ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <IntegrationViewLink href="/dashboard/integrations/notion" />
                <SyncButton endpoint="/api/integrations/notion/sync" requestBody={{ workspaceId }} resultLabel="pages" hideReset />
              </div>
              <ResetLink resetType="notion" />
            </>
          ) : (
            <button type="button" onClick={() => setGuideOpen(true)} className={integrationConnectClass}>
              Connect
            </button>
          )}
        </div>
      </Card>

      <NotionSetupModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </>
  )
}
