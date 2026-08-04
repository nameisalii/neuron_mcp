'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SlackChannelPicker from '@/components/integrations/SlackChannelPicker'
import { StatusBadge, ResetLink, DisconnectIntegrationButton, IntegrationViewLink, integrationConnectClass, integrationPrimaryClass } from './IntegrationCardUi'
import SyncButton from './SyncButton'

export interface SlackBotConnectionView {
  teamName: string | null
  createdAt: string
  lastSyncAt: string | null
  channels: string[]
}

export interface SlackUserConnectionView {
  teamName: string | null
  externalUserName: string | null
  lastSyncAt: string | null
  scopes: string[]
  selectedCount?: number
  settings: {
    publicChannels: boolean
    privateChannels: boolean
    groupDms: boolean
    dms: boolean
    excludedConversationNames?: string[]
  }
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : 'Never'
}

export default function SlackIntegrationCard({
  botConnection,
  userConnection,
}: {
  botConnection: SlackBotConnectionView | null
  userConnection: SlackUserConnectionView | null
}) {
  const router = useRouter()
  const [selectedCount, setSelectedCount] = useState(userConnection?.selectedCount ?? 0)
  const [lastSyncAt, setLastSyncAt] = useState(userConnection?.lastSyncAt ?? null)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function disconnectPersonal() {
    if (!window.confirm('Disconnect your personal Slack access? Existing personal knowledge is kept.')) return
    const response = await fetch('/api/integrations/slack/user-settings', { method: 'DELETE' }).catch(() => null)
    if (response?.ok) router.refresh()
    else setMessage('Could not disconnect personal Slack access.')
  }

  async function syncSelected() {
    if (selectedCount === 0) {
      setMessage('Choose at least one conversation before syncing.')
      return
    }
    setSyncing(true)
    setMessage(null)
    const response = await fetch('/api/integrations/slack/sync-selected', { method: 'POST' }).catch(() => null)
    const body = response ? await response.json().catch(() => ({})) : {}
    setSyncing(false)
    if (!response?.ok) {
      setMessage(body.error ?? 'Could not sync selected Slack conversations.')
      return
    }
    setLastSyncAt(new Date().toISOString())
    setMessage('Synced selected Slack conversations.')
  }

  return (
    <Card padding="md" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <BrandTile brand="slack" className="h-12 w-12" />
          <div>
            <h3 className="text-lg font-display font-semibold text-ink">Slack</h3>
            <p className="mt-0.5 text-xs text-muted">
              Choose shared bot access, personal Slack access, or both.
            </p>
          </div>
        </div>
        <StatusBadge connected={Boolean(botConnection || userConnection)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-warm/70 bg-cream p-4">
          <h4 className="font-semibold text-ink">Workspace Bot Mode</h4>
          <p className="mt-1 text-sm text-muted">Reads channels where the Neuron bot is added. Best for shared company channels and controlled access.</p>
          {botConnection ? (
            <div className="mt-3 space-y-2 text-xs text-muted">
              <p className="font-medium text-positive">Bot mode connected · {botConnection.teamName ?? 'Slack workspace'}</p>
              <p>Last sync: {formatDate(botConnection.lastSyncAt)}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!userConnection ? <IntegrationViewLink href="/dashboard/integrations/slack" /> : null}
                <SyncButton endpoint="/api/integrations/slack/sync?mode=bot" resultLabel="messages" hideReset />
                <ResetLink resetType="slack" />
                <DisconnectIntegrationButton type="slack" />
              </div>
            </div>
          ) : (
            <a href="/api/integrations/slack/connect?mode=bot" className={`mt-3 ${integrationConnectClass}`}>Connect bot</a>
          )}
        </section>

        <section className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
          <h4 className="font-semibold text-ink">Personal Slack Access</h4>
          <p className="mt-1 text-sm text-muted">Connect your Slack account so Neuron can read conversations you already have access to.</p>
          {userConnection ? (
            <div className="mt-3 space-y-3 text-xs text-muted">
              <p className="font-medium text-positive">Personal Slack Access connected · {userConnection.teamName ?? 'Slack workspace'}{userConnection.externalUserName ? ` · ${userConnection.externalUserName}` : ''}</p>
              <p className="font-medium text-ink">{selectedCount > 0 ? `${selectedCount} conversations selected` : 'No Slack conversations selected yet.'}</p>
              <p>Last synced: {formatDate(lastSyncAt)}</p>
              <p>Permissions granted: {userConnection.scopes.length > 0 ? userConnection.scopes.join(', ') : 'Reconnect to review permissions'}</p>
              <p>Only selected conversations are synced. Private channels and DMs stay personal.</p>
              {message && <p aria-live="polite">{message}</p>}
            </div>
          ) : (
            <a href="/api/integrations/slack/connect?mode=user" className={`mt-3 ${integrationConnectClass}`}>Connect Slack account</a>
          )}
        </section>
      </div>

      <div className="mt-4 space-y-1 text-xs text-muted">
        <p>Neuron can only access Slack conversations your Slack account already has permission to access. Some workspaces require admin approval before this can work.</p>
        <p>If Slack reports <code>invalid_team_for_non_distributed_app</code>, use the workspace where the app was created or enable Slack app distribution.</p>
      </div>

      {userConnection ? (
        <div data-testid="slack-card-actions" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-warm/60 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <IntegrationViewLink href="/dashboard/integrations/slack" />
            <button type="button" onClick={() => setIsPickerOpen(true)} className={integrationPrimaryClass}>
              {selectedCount > 0 ? 'Manage channels' : 'Choose channels'}
            </button>
            <button
              type="button"
              onClick={syncSelected}
              disabled={syncing || selectedCount === 0}
              className="inline-flex h-9 items-center justify-center rounded-[10px] border border-warm bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync selected'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href="/api/integrations/slack/connect?mode=user" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Reconnect</a>
            <button type="button" onClick={disconnectPersonal} className="text-xs font-medium text-red-600 hover:text-red-700">Disconnect personal access</button>
          </div>
        </div>
      ) : null}

      {userConnection && isPickerOpen ? (
        <div id="slack-channel-picker" className="mt-4">
          <SlackChannelPicker
            connected
            onSelectionSaved={setSelectedCount}
            onClose={() => setIsPickerOpen(false)}
            onSyncSuccess={(syncedAt) => {
              setLastSyncAt(syncedAt)
              setMessage('Synced selected Slack conversations.')
            }}
          />
        </div>
      ) : null}
    </Card>
  )
}
