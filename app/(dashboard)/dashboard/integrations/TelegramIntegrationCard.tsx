'use client'

import { useState } from 'react'
import { CheckCircle, Copy, Loader2, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import {
  IntegrationViewLink,
  ResetLink,
  integrationActionClass,
  integrationConnectClass,
} from './IntegrationCardUi'

interface TelegramIntegrationCardProps {
  connected: boolean
  configured: boolean
  botUsername: string
  createdAt?: string | null
  lastSyncAt?: string | null
}

interface SetupData {
  configured: boolean
  connected: boolean
  botUsername: string
  setupCommand: string
  message: string
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'

export default function TelegramIntegrationCard({
  connected,
  configured,
  botUsername,
  createdAt,
  lastSyncAt,
}: TelegramIntegrationCardProps) {
  const router = useRouter()
  const [showSetup, setShowSetup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [setup, setSetup] = useState<SetupData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function openSetup() {
    setShowSetup(true)
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/integrations/telegram/connect')
      const data = await response.json() as SetupData & { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not start Telegram setup')
      setSetup(data)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Telegram setup')
    } finally {
      setLoading(false)
    }
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Card padding="md" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <BrandTile brand="telegram" className="h-12 w-12" />
          <div className="min-w-0">
            <h3 className="text-lg font-display font-semibold text-ink">Telegram</h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              {connected
                ? 'Telegram is connected. Neuron will capture new useful messages from connected groups/channels.'
                : 'Telegram is not connected yet. Add the Neuron bot to a Telegram group or channel, then send the connection command there.'}
            </p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
          connected ? 'bg-[#E6F2EC] text-positive' : 'bg-cream text-muted'
        }`}>
          {connected ? <CheckCircle className="h-3.5 w-3.5" /> : null}
          {connected ? 'Connected' : 'Not configured'}
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
              <p className="mb-0.5 text-xs text-muted">Last message</p>
              <p className="font-medium text-ink">{lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Waiting'}</p>
            </div>
          </div>
        ) : (
          <p>
            Telegram is not connected yet. Add the Neuron bot to a Telegram group or channel, then send the connection command there.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          Neuron only captures new messages after setup. Old Telegram history cannot be imported through the official bot API.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
        {connected ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <IntegrationViewLink href="/dashboard/integrations/telegram" />
              <SyncButton endpoint="/api/integrations/telegram/sync" resultLabel="messages" hideReset />
              <button type="button" onClick={() => void openSetup()} className={integrationActionClass}>
                <Settings className="h-3.5 w-3.5" />
                Setup
              </button>
            </div>
            <ResetLink resetType="telegram" />
          </>
        ) : (
          <button type="button" onClick={() => void openSetup()} className={integrationConnectClass}>
            Configure
          </button>
        )}
      </div>

      {showSetup && (
        <div className="mt-5 space-y-4 border-t border-warm/60 pt-5">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-ink">Connect Telegram to Neuron</h4>
            <button type="button" onClick={() => setShowSetup(false)} className="text-xs text-muted hover:text-ink">Close</button>
          </div>
          <p className="text-sm text-muted">
            Connect a Telegram group or channel to Neuron so new useful messages can become searchable company knowledge. Neuron starts capturing messages after the bot is added and connected. Old chat history is not available through Telegram’s official bot API.
          </p>
          <p className="rounded-lg border border-warm/60 bg-cream px-3 py-2 text-sm text-ink">
            Bot to add: <span className="font-mono">@{setup?.botUsername ?? botUsername}</span>
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>Open the Telegram group or channel you want Neuron to learn from.</li>
            <li>Add the Neuron bot to the group or channel.</li>
            <li>If it is a group, make sure the bot can read messages.</li>
            <li>Copy the connection command below.</li>
            <li>Paste the command inside that Telegram group or channel.</li>
            <li>Send one useful test message after connecting.</li>
            <li>Come back to Neuron and click Sync Now or check the Overview.</li>
          </ol>

          {loading && <p className="inline-flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Preparing setup…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!configured && !loading && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Telegram server configuration is managed by Neuron.
            </p>
          )}
          {setup && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Copy this command and send it in the Telegram group/channel where you added the Neuron bot.
              </p>
              <CopyField
                label="Connection command"
                value={setup.setupCommand}
                copied={copied === 'command'}
                onCopy={() => void copy(setup.setupCommand, 'command')}
                copyLabel="Copy connection command"
                copiedLabel="Connection command copied"
              />
              <p className="text-xs text-muted">{setup.message}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function CopyField({
  label,
  value,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  copyLabel?: string
  copiedLabel?: string
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-warm bg-white px-3 py-2">
        <code className="min-w-0 flex-1 break-all text-xs text-ink">{value}</code>
        <button type="button" onClick={onCopy} className="shrink-0 text-muted hover:text-ink" aria-label={copyLabel ?? `Copy ${label}`}>
          {copied ? <CheckCircle className="h-4 w-4 text-positive" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {copied && <p className="mt-1 text-xs text-positive">{copiedLabel ?? `${label} copied`}</p>}
    </div>
  )
}
