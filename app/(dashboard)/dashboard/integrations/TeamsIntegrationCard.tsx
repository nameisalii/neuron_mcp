'use client'

import { AlertTriangle, CheckCircle, Copy, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import {
  IntegrationViewLink,
  ResetLink,
  DisconnectIntegrationButton,
  integrationConnectClass,
} from './IntegrationCardUi'

interface TeamsIntegrationCardProps {
  connected: boolean
  teamsSyncEnabled?: boolean
  needsReconnect?: boolean
  adminConsentRequired?: boolean
  teamName?: string | null
  createdAt?: string | null
  lastSyncAt?: string | null
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'
export const adminInstructions = 'Please approve the Neuron enterprise application in Microsoft Entra ID and grant consent for the Microsoft Graph permissions required for Teams sync, including ChannelMessage.Read.All, Team.ReadBasic.All, and Channel.ReadBasic.All.'

export default function TeamsIntegrationCard({
  connected,
  teamsSyncEnabled = false,
  needsReconnect = false,
  adminConsentRequired = false,
  teamName,
  createdAt,
  lastSyncAt,
}: TeamsIntegrationCardProps) {
  const statusLabel = needsReconnect
    ? 'Needs reconnect'
    : adminConsentRequired
      ? 'Admin consent required'
      : connected
        ? 'Connected'
        : 'Not configured'

  const statusClass = connected && !needsReconnect && !adminConsentRequired
    ? 'bg-[#E6F2EC] text-positive'
    : needsReconnect || adminConsentRequired
      ? 'bg-amber-50 text-amber-700'
      : 'bg-cream text-muted'

  return (
    <Card padding="md" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <BrandTile brand="teams" className="h-12 w-12" />
          <div className="min-w-0">
            <h3 className="text-lg font-display font-semibold text-ink">Microsoft Teams</h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              {connected ? `Microsoft account connected${teamName ? ` as ${teamName}` : ''}` : 'Connect your Microsoft account'}
            </p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${statusClass}`}>
          {connected && !needsReconnect && !adminConsentRequired ? <CheckCircle className="h-3.5 w-3.5" /> : null}
          {(needsReconnect || adminConsentRequired) ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
          {statusLabel}
        </span>
      </div>

      <div className="mt-5 flex-1 text-sm text-muted">
        {connected ? (
          <div className="space-y-3">
            <p className="font-medium text-ink">Microsoft account connected.</p>
            {!teamsSyncEnabled ? (
              <p>Teams message sync requires administrator approval from your Microsoft 365 organization.</p>
            ) : null}
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
          </div>
        ) : (
          <p>
            Connect Microsoft Teams with Microsoft Graph. Neuron syncs accessible recent channel messages; tenant-wide or private chat access may require admin consent.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          Teams v1 uses official Microsoft Graph APIs and manual/recent sync. It does not scrape Teams web or use browser sessions.
        </p>
        {adminConsentRequired ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-semibold">Your Microsoft organization requires administrator approval</p>
                <p className="text-xs leading-relaxed">
                  Your organization controls access to Teams channel data. Ask your Microsoft 365 admin to approve Neuron, or connect a workspace where you have permission.
                </p>
                <p className="text-xs leading-relaxed">{adminInstructions}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
        {connected ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <IntegrationViewLink href="/dashboard/integrations/teams" />
              {teamsSyncEnabled ? <SyncButton endpoint="/api/integrations/teams/sync" resultLabel="messages" hideReset /> : (
                <a href="/api/integrations/teams/connect?level=teams" className={integrationConnectClass}>Enable Teams message sync</a>
              )}
              {(needsReconnect || adminConsentRequired) && <a href="/api/integrations/teams/connect?level=teams" className={integrationConnectClass}>Try another Microsoft account</a>}
              {adminConsentRequired && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(adminInstructions)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-warm px-3 text-sm font-medium text-muted transition-colors hover:bg-white hover:text-ink"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy admin approval instructions
                </button>
              )}
              <DisconnectIntegrationButton type="teams" />
            </div>
            <ResetLink resetType="teams" />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <a href="/api/integrations/teams/connect?level=basic" className={integrationConnectClass}>
              {adminConsentRequired ? 'Try another Microsoft account' : 'Connect'}
            </a>
            {adminConsentRequired ? (
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(adminInstructions)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-warm px-3 text-sm font-medium text-muted transition-colors hover:bg-white hover:text-ink"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy admin approval instructions
              </button>
            ) : null}
            <span className="text-xs text-muted">Organization accounts may require administrator approval.</span>
          </div>
        )}
      </div>
    </Card>
  )
}
