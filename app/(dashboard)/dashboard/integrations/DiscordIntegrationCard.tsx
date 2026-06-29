import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import { StatusBadge, ResetLink, IntegrationViewLink, integrationConnectClass } from './IntegrationCardUi'

interface DiscordIntegrationCardProps {
  connected: boolean
  teamName?: string | null
  createdAt?: string | null
  lastSyncAt?: string | null
}

const statTileClass = 'bg-cream rounded-xl px-3.5 py-2.5 border border-warm/60'

export default function DiscordIntegrationCard({
  connected,
  teamName,
  createdAt,
  lastSyncAt,
}: DiscordIntegrationCardProps) {
  return (
    <Card padding="md" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <BrandTile brand="discord" className="h-12 w-12" />
          <div className="min-w-0">
            <h3 className="text-lg font-display font-semibold text-ink">Discord</h3>
            <p className="text-xs text-muted mt-0.5 truncate">
              {connected ? `Connected to ${teamName ?? 'your server'}` : 'Connect your Discord server'}
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
              <p className="font-medium text-ink">{createdAt ? new Date(createdAt).toLocaleDateString() : '—'}</p>
            </div>
            <div className={statTileClass}>
              <p className="text-xs text-muted mb-0.5">Last synced</p>
              <p className="font-medium text-ink">{lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Never'}</p>
            </div>
          </div>
        ) : (
          <p>
            Invite the Neuron bot to your server. Neuron reads accessible channels and extracts rules, decisions, and ideas from messages.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
        {connected ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <IntegrationViewLink href="/dashboard/integrations/discord" />
              <SyncButton endpoint="/api/integrations/discord/sync" resultLabel="messages" hideReset />
            </div>
            <ResetLink resetType="discord" />
          </>
        ) : (
          <a href="/api/integrations/discord/connect" className={integrationConnectClass}>Connect</a>
        )}
      </div>
    </Card>
  )
}
