'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, ShieldCheck, Truck } from 'lucide-react'
import { createPortal } from 'react-dom'
import { isValidDatatruckCompanyName, normalizeDatatruckCompanyName } from '@/lib/datatruck/client'

interface DatatruckSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onConfigured: () => void
  /** Prefill from the developer env fallback — never a token, only the company name. */
  initialCompanyName?: string | null
}

export default function DatatruckSetupModal({
  isOpen,
  onClose,
  onConfigured,
  initialCompanyName,
}: DatatruckSetupModalProps) {
  const [mounted, setMounted] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  // Reset on every open. The token is write-only from the UI — never prefilled.
  useEffect(() => {
    if (!isOpen) return
    setCompanyName(initialCompanyName ?? '')
    setApiToken('')
    setError(null)
  }, [isOpen, initialCompanyName])

  const normalizedCompanyName = normalizeDatatruckCompanyName(companyName)
  const trimmedToken = apiToken.trim()
  const canSubmit = normalizedCompanyName.length > 0 && trimmedToken.length > 0

  async function handleConnect() {
    if (!normalizedCompanyName) {
      setError('Company name is required.')
      return
    }
    if (!isValidDatatruckCompanyName(normalizedCompanyName)) {
      setError('Enter a valid Datatruck company name, like "sflogistics".')
      return
    }
    if (!trimmedToken) {
      setError('API token is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/datatruck/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: normalizedCompanyName, apiToken: trimmedToken }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to connect Datatruck')
      setApiToken('')
      onConfigured()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Datatruck')
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
              <Truck className="h-4 w-4 text-[#1C1A17]" />
              <h3 className="text-lg font-semibold text-gray-900">Connect Datatruck</h3>
            </div>
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
          </div>

          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-gray-600">
              Enter your Datatruck company name and API token. Neuron will use this to sync loads,
              drivers, trucks, trailers, work orders, and dispatcher board data.
            </p>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Company name</span>
              <input
                type="text"
                autoComplete="off"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="sflogistics"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-gray-500">
                Your company name is the first part of your Datatruck URL. For example, if your URL is
                sflogistics.datatruck.io, enter sflogistics.
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">API token</span>
              <input
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Paste your Datatruck API token"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-xs text-gray-500">
                You can create this in Datatruck Settings → API Tokens.
              </span>
            </label>

            <div className="flex items-start gap-2 rounded-lg border border-warm/60 bg-cream px-3 py-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
              <p className="text-xs text-gray-600">
                Your token is encrypted at rest and used only to sync your Datatruck data. It is never
                shown again after saving — reconnect anytime to replace it.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between pt-1">
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={() => void handleConnect()}
                disabled={saving || !canSubmit}
                className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-deep disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Connect Datatruck
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
