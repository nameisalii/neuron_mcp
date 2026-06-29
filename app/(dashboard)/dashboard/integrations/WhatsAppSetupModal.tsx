'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, MessageCircle, ShieldCheck } from 'lucide-react'
import { createPortal } from 'react-dom'

interface WhatsAppSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onConfigured: () => void
  connected: boolean
}

export default function WhatsAppSetupModal({
  isOpen,
  onClose,
  onConfigured,
  connected,
}: WhatsAppSetupModalProps) {
  const [mounted, setMounted] = useState(false)
  const [accessToken, setAccessToken] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [businessAccountId, setBusinessAccountId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!isOpen) return
    setAccessToken('')
    setPhoneNumberId('')
    setBusinessAccountId('')
    setError(null)
  }, [isOpen])

  const token = accessToken.trim()
  const phoneId = phoneNumberId.trim()
  const businessId = businessAccountId.trim()
  const looksValid = token.length >= 20 && phoneId.length >= 6

  async function handleSave() {
    if (!looksValid) {
      setError('Enter a WhatsApp Cloud API access token and phone number ID.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          phoneNumberId: phoneId,
          businessAccountId: businessId || undefined,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to connect WhatsApp Business')
      setAccessToken('')
      setPhoneNumberId('')
      setBusinessAccountId('')
      onConfigured()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect WhatsApp Business')
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
          className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-[#25D366]" />
              <h3 className="text-lg font-semibold text-gray-900">
                {connected ? 'Update WhatsApp Business' : 'Connect WhatsApp Business'}
              </h3>
            </div>
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
          </div>

          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-gray-600">
              Paste your Meta WhatsApp Cloud API access token and phone number ID. Neuron imports new
              inbound customer messages from the WhatsApp webhook after setup.
            </p>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Access token</span>
              <input
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAG..."
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Phone number ID</span>
              <input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="123456789012345"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">WhatsApp Business Account ID optional</span>
              <input
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
                placeholder="123456789012345"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-sm"
              />
            </label>

            <div className="flex items-start gap-2 rounded-lg border border-warm/60 bg-cream px-3 py-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
              <p className="text-xs text-gray-600">
                The token is encrypted at rest. Configure Meta webhooks to
                <span className="font-mono"> /api/integrations/whatsapp/webhook</span> using the
                <span className="font-mono"> WHATSAPP_VERIFY_TOKEN</span> from your environment.
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
                {connected ? 'Update connection' : 'Save & connect'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
