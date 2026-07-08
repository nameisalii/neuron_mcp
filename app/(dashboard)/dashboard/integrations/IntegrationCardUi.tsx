'use client'

import { useState } from 'react'
import { CheckCircle, ExternalLink, Link2Off, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Consistent action-button sizing shared by every integration card.
export const integrationActionClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-warm px-4 text-sm font-medium text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50'

export const integrationConnectClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-navy px-4 text-sm font-medium text-white shadow-soft transition-all hover:-translate-y-0.5 hover:bg-navy-deep hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

// Primary navy fill for the main action (Sync Now).
export const integrationPrimaryClass = integrationConnectClass

export const integrationResetClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-red-200 px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50'

type IntegrationType = 'slack' | 'notion' | 'linear' | 'gmail' | 'granola' | 'discord' | 'telegram' | 'teams' | 'jira' | 'whatsapp' | 'datatruck'
type ResetType = Exclude<IntegrationType, 'datatruck'>

export function IntegrationViewLink({ href }: { href: string }) {
  return (
    <Link href={href} className={integrationActionClass}>
      <ExternalLink className="h-3.5 w-3.5" />
      View
    </Link>
  )
}

function integrationLabel(type: IntegrationType) {
  if (type === 'gmail') return 'Gmail'
  if (type === 'jira') return 'Jira'
  if (type === 'teams') return 'Microsoft Teams'
  if (type === 'whatsapp') return 'WhatsApp'
  if (type === 'datatruck') return 'Datatruck'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function hasBindings(type: IntegrationType) {
  return type === 'discord' || type === 'telegram' || type === 'teams' || type === 'whatsapp'
}

export function DisconnectIntegrationButton({ type }: { type: IntegrationType }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteKnowledgeItems, setDeleteKnowledgeItems] = useState(false)
  const label = integrationLabel(type)

  async function handleDisconnect() {
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch(`/api/integrations/${type}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteKnowledgeItems }),
      })
      if (!res.ok) throw new Error('disconnect failed')
      setDeleteKnowledgeItems(false)
      setOpen(false)
      router.refresh()
    } catch {
      setError(`Could not disconnect ${label}. Please try again.`)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setDeleteKnowledgeItems(false)
          setOpen(true)
        }}
        className={integrationActionClass}
      >
        <Link2Off className="h-3.5 w-3.5" />
        Disconnect
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`disconnect-${type}-title`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !disconnecting) setOpen(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !disconnecting) setOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-warm bg-white p-5 shadow-lift">
            <h2 id={`disconnect-${type}-title`} className="text-lg font-display font-semibold text-ink">
              Disconnect {label}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Neuron will stop syncing new data from {label}. Existing imported knowledge stays in Neuron unless you delete it separately. To connect again, you’ll need to go through the setup process again.
            </p>
            {hasBindings(type) && (
              <p className="mt-2 text-sm leading-6 text-muted">
                Connected channels or webhook bindings will also be removed.
              </p>
            )}
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-warm/70 bg-cream px-3 py-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={deleteKnowledgeItems}
                onChange={(event) => setDeleteKnowledgeItems(event.target.checked)}
                disabled={disconnecting}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className="leading-6">
                Also delete imported knowledge items and attachments from {label}.
              </span>
            </label>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={disconnecting}
                className={integrationActionClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className={integrationResetClass}
              >
                <Link2Off className="h-3.5 w-3.5" />
                {disconnecting ? 'Disconnecting…' : deleteKnowledgeItems ? 'Disconnect and delete' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Connection status pill — pinned to the top-right corner of every card.
 * Connected = green tint. Not connected = warm gray tint.
 */
export function StatusBadge({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#E6F2EC] px-3 py-1 text-sm font-medium text-positive">
        <CheckCircle className="h-3.5 w-3.5" />
        Connected
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-sm font-medium text-muted">
      Not connected
    </span>
  )
}

// Kept for backwards compatibility; prefer StatusBadge for the top-right slot.
export function ConnectedBadge() {
  return <StatusBadge connected />
}

/**
 * Destructive reset — small, muted text link pinned bottom-right of a card.
 * Red only on hover so it never competes with the primary actions.
 * Preserves the original confirm + POST /api/integrations/{type}/reset behavior.
 */
export function ResetLink({ resetType }: { resetType: ResetType }) {
  const router = useRouter()
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReset() {
    const label = resetType.charAt(0).toUpperCase() + resetType.slice(1)
    const confirmed = window.confirm(
      `Reset all ${label} data? This removes only ${label} knowledge and embeddings. Other integrations are not affected.`,
    )
    if (!confirmed) return
    setResetting(true)
    setError(null)
    try {
      const res = await fetch(`/api/integrations/${resetType}/reset`, { method: 'POST' })
      if (res.ok) router.refresh()
      else setError('Reset failed')
    } catch {
      setError('Reset failed')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleReset}
        disabled={resetting}
        title={`Remove only ${resetType} data and embeddings`}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-red-600 disabled:opacity-50"
      >
        <Trash2 className={`h-3 w-3 ${resetting ? 'animate-pulse' : ''}`} />
        {resetting ? 'Resetting…' : 'Nuclear Reset'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
