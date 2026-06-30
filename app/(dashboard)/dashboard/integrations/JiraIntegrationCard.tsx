'use client'

import { AlertTriangle, CheckCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import {
  IntegrationViewLink,
  ResetLink,
  integrationConnectClass,
} from './IntegrationCardUi'

interface JiraIntegrationCardProps {
  connected: boolean
  needsReconnect?: boolean
  permissionIssue?: boolean
  siteName?: string | null
  createdAt?: string | null
  lastSyncAt?: string | null
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'

export default function JiraIntegrationCard({
  connected,
  needsReconnect = false,
  permissionIssue = false,
  siteName,
  createdAt,
  lastSyncAt,
}: JiraIntegrationCardProps) {
  const statusLabel = needsReconnect
    ? 'Needs reconnect'
    : permissionIssue
      ? 'Permission issue'
      : connected
        ? 'Connected'
        : 'Not configured'

  const statusClass = connected && !needsReconnect && !permissionIssue
    ? 'bg-[#E6F2EC] text-positive'
    : needsReconnect || permissionIssue
      ? 'bg-amber-50 text-amber-700'
      : 'bg-cream text-muted'

  return (
    <Card padding="md" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <BrandTile brand="jira" className="h-12 w-12" />
          <div className="min-w-0">
            <h3 className="text-lg font-display font-semibold text-ink">Jira</h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              {connected ? `Connected${siteName ? ` to ${siteName}` : ''}` : 'Sync recent Jira issues and comments'}
            </p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${statusClass}`}>
          {connected && !needsReconnect && !permissionIssue ? <CheckCircle className="h-3.5 w-3.5" /> : null}
          {(needsReconnect || permissionIssue) ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
          {statusLabel}
        </span>
      </div>

      <div className="mt-5 flex-1 text-sm text-muted">
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
          <p>
            Connect Jira to sync recent issues, comments, bugs, decisions, and project updates into your Neuron company brain.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          Jira uses official Atlassian OAuth and Jira Cloud REST APIs. Neuron never asks for personal Jira API tokens.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
        {connected ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <IntegrationViewLink href="/dashboard/integrations/jira" />
              <SyncButton endpoint="/api/integrations/jira/sync" resultLabel="issues" hideReset />
              {needsReconnect && <a href="/api/integrations/jira/connect" className={integrationConnectClass}>Reconnect</a>}
            </div>
            <ResetLink resetType="jira" />
          </>
        ) : (
          <a href="/api/integrations/jira/connect" className={integrationConnectClass}>Connect</a>
        )}
      </div>
    </Card>
  )
}
