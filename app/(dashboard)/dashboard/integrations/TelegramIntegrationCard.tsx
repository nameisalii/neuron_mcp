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
  webhookUrl: string
  createdAt?: string | null
  lastSyncAt?: string | null
}

interface SetupData {
  configured: boolean
  connected: boolean
  webhookRegistered: boolean
  webhookUrl: string
  setupCommand: string
  message: string
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'

export default function TelegramIntegrationCard({
  connected,
  configured,
  webhookUrl,
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
              {connected ? 'Receiving new group and channel messages' : 'Connect the Neuron bot to Telegram'}
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
            Telegram sync starts from new messages after the bot is added and the webhook is configured. Old chat history is not available through the official bot API.
          </p>
        )}
        <div className="mt-3 rounded-lg border border-warm/60 bg-cream px-3 py-2">
          <p className="text-xs font-medium text-ink">Webhook URL</p>
          <p className="mt-1 break-all font-mono text-xs text-muted">{webhookUrl}</p>
        </div>
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
            <h4 className="font-semibold text-ink">Telegram Bot API setup</h4>
            <button type="button" onClick={() => setShowSetup(false)} className="text-xs text-muted hover:text-ink">Close</button>
          </div>
          <p className="text-sm text-muted">
            Telegram sync starts from new messages after the bot is added and the webhook is configured. Old chat history is not available through the official bot API.
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>Open <span className="font-medium text-ink">@BotFather</span> in Telegram.</li>
            <li>Create a bot with <code>/newbot</code>. For group capture, use <code>/setprivacy</code> in BotFather and disable privacy mode.</li>
            <li>Add <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_WEBHOOK_SECRET</code> to the server.</li>
            <li>Set the webhook using the generated URL below. Neuron registers it automatically when configured.</li>
            <li>Add the bot to a Telegram group or channel and grant permission to read posts.</li>
            <li>Send the connection command, then send a test message.</li>
          </ol>

          {loading && <p className="inline-flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Preparing setup…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!configured && !loading && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Telegram environment variables are not configured on this server yet.
            </p>
          )}
          {setup && (
            <div className="space-y-3">
              <CopyField
                label="Webhook URL"
                value={setup.webhookUrl}
                copied={copied === 'webhook'}
                onCopy={() => void copy(setup.webhookUrl, 'webhook')}
              />
              <CopyField
                label="Connection command"
                value={setup.setupCommand}
                copied={copied === 'command'}
                onCopy={() => void copy(setup.setupCommand, 'command')}
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
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-warm bg-white px-3 py-2">
        <code className="min-w-0 flex-1 break-all text-xs text-ink">{value}</code>
        <button type="button" onClick={onCopy} className="shrink-0 text-muted hover:text-ink" aria-label={`Copy ${label}`}>
          {copied ? <CheckCircle className="h-4 w-4 text-positive" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
