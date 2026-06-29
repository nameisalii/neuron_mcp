'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, NotebookPen, ShieldCheck } from 'lucide-react'
import { createPortal } from 'react-dom'

interface GranolaSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onConfigured: () => void
  /** True when a token is already saved — the modal then acts as "replace token". */
  connected: boolean
}

// Granola personal API keys are issued with a stable prefix. We validate the
// shape client-side for fast feedback; the server re-validates by calling the API.
const GRANOLA_TOKEN_PREFIX = 'grn_'

export default function GranolaSetupModal({
  isOpen,
  onClose,
  onConfigured,
  connected,
}: GranolaSetupModalProps) {
  const [mounted, setMounted] = useState(false)
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  // Never prefill or retain the token across opens — it is write-only from the UI.
  useEffect(() => {
    if (!isOpen) return
    setToken('')
    setError(null)
  }, [isOpen])

  const trimmed = token.trim()
  const looksValid = trimmed.length >= 8 && trimmed.startsWith(GRANOLA_TOKEN_PREFIX)

  async function handleSave() {
    if (!looksValid) {
      setError(`Enter a valid Granola personal API key (starts with "${GRANOLA_TOKEN_PREFIX}").`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/granola/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: trimmed }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to save Granola API key')
      setToken('')
      onConfigured()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Granola API key')
    } finally {
      setSaving(false)
    }
  }

  if (!mounted || !isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <NotebookPen className="h-4 w-4 text-[#1C1A17]" />
              <h3 className="text-lg font-semibold text-gray-900">
                {connected ? 'Replace Granola API key' : 'Connect Granola'}
              </h3>
            </div>
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
          </div>

          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-gray-600">
              Paste your Granola <span className="font-medium">personal API key</span>. Create one in the
              Granola desktop app under <span className="font-medium">Settings → Connectors → API keys</span>.
            </p>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Granola personal API key</span>
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="grn_xxxxxxxxxxxxxxxx"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-sm"
              />
            </label>

            <div className="flex items-start gap-2 rounded-lg border border-warm/60 bg-cream px-3 py-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
              <p className="text-xs text-gray-600">
                Your key is encrypted at rest and used only to sync your Granola notes. It is never shown
                again after saving — paste a new key here anytime to replace it.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between pt-1">
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Not now</button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || !looksValid}
                className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-deep disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {connected ? 'Replace key' : 'Save & connect'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
