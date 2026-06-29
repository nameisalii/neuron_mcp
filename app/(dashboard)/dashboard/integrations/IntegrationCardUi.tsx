'use client'

import { useState } from 'react'
import { CheckCircle, ExternalLink, Trash2 } from 'lucide-react'
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

type ResetType = 'slack' | 'notion' | 'linear' | 'gmail' | 'granola' | 'discord' | 'telegram' | 'whatsapp'

export function IntegrationViewLink({ href }: { href: string }) {
  return (
    <Link href={href} className={integrationActionClass}>
      <ExternalLink className="h-3.5 w-3.5" />
      View
    </Link>
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
