'use client'

import { useState } from 'react'
import { CheckCircle, Copy, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { BrandTile } from '@/components/BrandLogo'
import SyncButton from './SyncButton'
import TelegramAccountPanel from '@/components/integrations/TelegramAccountPanel'
import {
  ResetLink,
  DisconnectIntegrationButton,
  integrationActionClass,
  integrationConnectClass,
} from './IntegrationCardUi'

interface TelegramIntegrationCardProps {
  connected: boolean
  configured: boolean
  botUsername: string
  createdAt?: string | null
  lastSyncAt?: string | null
  publicImportEnabled?: boolean
  accountSyncEnabled?: boolean
  accountStatus?: string | null
  accountDisplayName?: string | null
  accountUsername?: string | null
  accountSelectedCount?: number
  accountLastSyncAt?: string | null
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
  publicImportEnabled = false,
  accountSyncEnabled = false,
  accountStatus = null,
  accountDisplayName = null,
  accountUsername = null,
  accountSelectedCount = 0,
  accountLastSyncAt = null,
}: TelegramIntegrationCardProps) {
  const router = useRouter()
  const [showSetup, setShowSetup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [setup, setSetup] = useState<SetupData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [publicUrl, setPublicUrl] = useState('')
  const [publicMessage, setPublicMessage] = useState<string | null>(null)
  const [publicBusy, setPublicBusy] = useState<'preview' | 'import' | null>(null)

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

  async function publicChannelAction(action: 'preview' | 'import') {
    setPublicBusy(action)
    setPublicMessage(null)
    const response = await fetch(`/api/integrations/telegram/public-channel/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: publicUrl, visibility: 'team' }),
    }).catch(() => null)
    const data = response ? await response.json().catch(() => ({})) : {}
    setPublicBusy(null)
    if (!response?.ok) return setPublicMessage(data.error ?? 'Public channel request failed.')
    setPublicMessage(action === 'preview'
      ? `Found ${data.recentPosts?.length ?? 0} recent public posts in @${data.username}.`
      : `Imported ${data.created ?? 0} recent posts from @${data.username}.`)
  }

  const accountConnected = accountStatus === 'connected'
  const anyConnected = connected || accountConnected

  return (
    <Card padding="md" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <BrandTile brand="telegram" className="h-12 w-12" />
          <div className="min-w-0">
            <h3 className="text-lg font-display font-semibold text-ink">Telegram</h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              {accountConnected
                ? 'Telegram Account Sync is connected. Neuron only reads chats you select.'
                : connected
                  ? 'Telegram Bot Mode is connected and captures future messages from configured chats.'
                  : 'Connect your Telegram account to choose chats, or use Bot Mode as a fallback.'}
            </p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
          anyConnected ? 'bg-[#E6F2EC] text-positive' : 'bg-cream text-muted'
        }`}>
          {anyConnected ? <CheckCircle className="h-3.5 w-3.5" /> : null}
          {anyConnected ? 'Connected' : 'Not configured'}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <TelegramAccountPanel
          enabled={accountSyncEnabled}
          initialStatus={accountStatus}
          displayName={accountDisplayName}
          username={accountUsername}
          initialSelectedCount={accountSelectedCount}
          initialLastSyncAt={accountLastSyncAt}
        />
        <section className="flex flex-col rounded-xl border border-warm/70 bg-cream p-4">
          <h4 className="font-semibold text-ink">Telegram Bot Mode</h4>
          <p className="mt-1 text-sm text-muted">Add @{botUsername} to groups/channels. Neuron will discover them and sync new messages after you choose them.</p>
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Telegram Bot API cannot read chats where the bot has not been added. To sync private groups/channels through Bot Mode, add the bot first.
          </p>
          <p className="mt-2 text-xs text-muted">
            Old Telegram history cannot be imported through the official bot API. Bot Mode captures future messages after setup.
          </p>
          <div className="mt-3 flex-1 text-sm text-muted">
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
            ) : <p>Telegram is not connected yet.</p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-warm/60 pt-3">
            <button type="button" onClick={() => void openSetup()} className={integrationActionClass}>View setup</button>
            <a href="/dashboard/integrations/telegram" className={integrationActionClass}>Manage discovered chats</a>
            <SyncButton endpoint="/api/integrations/telegram/sync" resultLabel="messages" hideReset label="Sync selected" />
          </div>
        </section>

        {publicImportEnabled ? <section className="flex flex-col rounded-xl border border-sky-100 bg-sky-50/50 p-4 lg:col-span-2">
          <h4 className="font-semibold text-ink">Import a public Telegram channel</h4>
          <p className="mt-1 text-sm text-muted">Public channel import works only for public Telegram channels. To sync private chats/groups, use Account Sync with your phone number.</p>
          <label className="mt-4 block text-xs font-medium text-ink">
            Public channel link
            <input value={publicUrl} onChange={(event) => setPublicUrl(event.target.value)} placeholder="@channelname or https://t.me/channelname" className="mt-1 w-full rounded-lg border border-warm bg-white px-3 py-2 text-sm" />
          </label>
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <button type="button" disabled={!publicImportEnabled || !publicUrl.trim() || Boolean(publicBusy)} onClick={() => void publicChannelAction('preview')} className={integrationActionClass}>Preview channel</button>
            <button type="button" disabled={!publicImportEnabled || !publicUrl.trim() || Boolean(publicBusy)} onClick={() => void publicChannelAction('import')} className={integrationConnectClass}>Import recent posts</button>
          </div>
          {publicMessage ? <p aria-live="polite" className="mt-2 text-xs text-muted">{publicMessage}</p> : null}
        </section> : null}
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
        {connected ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <DisconnectIntegrationButton type="telegram" />
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
            Bot to add:{' '}
            <a
              href={`https://t.me/${setup?.botUsername ?? botUsername}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent underline underline-offset-2"
            >
              @{setup?.botUsername ?? botUsername}
            </a>
          </p>
          <div className="grid gap-3 text-sm text-muted sm:grid-cols-2">
            <div className="rounded-xl border border-warm/60 p-3">
              <p className="font-medium text-ink">Direct messages</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>Open the bot link above.</li>
                <li>Send the connection command below.</li>
                <li>Send a new message after Neuron confirms the connection.</li>
              </ol>
            </div>
            <div className="rounded-xl border border-warm/60 p-3">
              <p className="font-medium text-ink">Groups</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>Add the Neuron bot to the group.</li>
                <li>Send the connection command in that group.</li>
                <li>If messages are not captured, open BotFather → /setprivacy → choose the bot → Disable.</li>
              </ol>
            </div>
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Telegram bots cannot read old history. Only new messages sent after setup are captured.
          </p>

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
