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
  fullAccountEnabled?: boolean
}

export default function DatatruckSetupModal({
  isOpen,
  onClose,
  onConfigured,
  fullAccountEnabled = false,
}: DatatruckSetupModalProps) {
  const [mounted, setMounted] = useState(false)
  const [connectionMode, setConnectionMode] = useState<'open_api' | 'full_account'>('open_api')
  const [companyName, setCompanyName] = useState('')
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [mfaChallenge, setMfaChallenge] = useState<{ challengeId: string; challengeType: string } | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  // Reset on every open. The token is write-only from the UI — never prefilled.
  useEffect(() => {
    if (!isOpen) return
    setConnectionMode('open_api')
    setCompanyName('')
    setUsernameOrEmail('')
    setPassword('')
    setApiToken('')
    setMfaChallenge(null)
    setMfaCode('')
    setIsHelpOpen(false)
    setError(null)
  }, [isOpen])

  const normalizedCompanyName = normalizeDatatruckCompanyName(companyName)
  const trimmedToken = apiToken.trim()
  const canSubmit = mfaChallenge
    ? mfaCode.trim().length > 0
    : connectionMode === 'open_api'
      ? normalizedCompanyName.length > 0 && trimmedToken.length > 0
      : usernameOrEmail.trim().length > 0 && password.length > 0

  async function handleConnect() {
    if (mfaChallenge) {
      setSaving(true)
      setError(null)
      try {
        const res = await fetch('/api/integrations/datatruck/full-account/mfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: mfaChallenge.challengeId, code: mfaCode.trim() }),
        })
        const data = (await res.json()) as { status?: string; message?: string }
        if (!res.ok || data.status !== 'connected') throw new Error(data.message ?? 'Could not verify the MFA code.')
        setPassword('')
        setMfaCode('')
        onConfigured()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not verify the MFA code.')
      } finally {
        setSaving(false)
      }
      return
    }

    if (connectionMode === 'full_account') {
      if (!fullAccountEnabled) {
        setError('Full Datatruck Account connector is not enabled.')
        return
      }
      if (!usernameOrEmail.trim() || !password) {
        setError('Datatruck username and password are required.')
        return
      }
      setSaving(true)
      setError(null)
      try {
        const company = normalizedCompanyName || undefined
        const res = await fetch('/api/integrations/datatruck/full-account/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company, usernameOrEmail: usernameOrEmail.trim(), password }),
        })
        const data = (await res.json()) as { status?: string; message?: string; challengeId?: string; challengeType?: string }
        if (data.status === 'mfa_required' && data.challengeId && data.challengeType) {
          setPassword('')
          setMfaChallenge({ challengeId: data.challengeId, challengeType: data.challengeType })
          return
        }
        if (!res.ok || data.status !== 'connected') throw new Error(data.message ?? 'Failed to connect Datatruck')
        setPassword('')
        onConfigured()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect Datatruck')
      } finally {
        setSaving(false)
      }
      return
    }

    if (!normalizedCompanyName) {
      setError('Company name is required.')
      return
    }
    if (!isValidDatatruckCompanyName(normalizedCompanyName)) {
      setError('Enter a valid Datatruck company name using lowercase letters, numbers, and hyphens.')
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
              {fullAccountEnabled
                ? 'Connect your Datatruck workspace with an API token, or use the local-only Full Account connector when enabled.'
                : 'Connect your Datatruck workspace by entering your Datatruck company name and API token.'}
            </p>

            {fullAccountEnabled && !mfaChallenge && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => setConnectionMode('open_api')}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${connectionMode === 'open_api' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  API Token
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionMode('full_account')}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${connectionMode === 'full_account' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  Full Datatruck Account
                </button>
              </div>
            )}

            {mfaChallenge ? (
              <div className="block">
                <label htmlFor="datatruck-mfa-code" className="text-xs font-medium text-gray-500">
                  Datatruck MFA code
                </label>
                <input
                  id="datatruck-mfa-code"
                  type="text"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="Enter your Datatruck MFA code"
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Challenge type: {mfaChallenge.challengeType}. The challenge is stored server-side for a short time and is bound to this workspace.
                </span>
              </div>
            ) : (
              <>
            <div className="block">
              <label htmlFor="datatruck-company-name" className="text-xs font-medium text-gray-500">
                {connectionMode === 'full_account' ? 'Company or organization' : 'Datatruck company name'}
              </label>
              <input
                id="datatruck-company-name"
                type="text"
                autoComplete="off"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Example: sflogistics"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-gray-500">
                {connectionMode === 'full_account'
                  ? 'Optional if Datatruck can find your tenant from your username. Otherwise enter the first part of your Datatruck URL.'
                  : 'This is the first part of your Datatruck URL. For example, if your Datatruck URL is https://sflogistics.datatruck.io, enter sflogistics.'}
              </span>
            </div>

            {connectionMode === 'open_api' ? (
              <div className="block">
              <label htmlFor="datatruck-api-token" className="text-xs font-medium text-gray-500">
                API token
              </label>
              <input
                id="datatruck-api-token"
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Paste your Datatruck API token"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-xs text-gray-500">
                Create or copy this from Datatruck → Settings → API Tokens.
              </span>
            </div>
            ) : (
              <>
                <div className="block">
                  <label htmlFor="datatruck-username" className="text-xs font-medium text-gray-500">
                    Email or username
                  </label>
                  <input
                    id="datatruck-username"
                    type="text"
                    autoComplete="username"
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    placeholder="Datatruck email or username"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="block">
                  <label htmlFor="datatruck-password" className="text-xs font-medium text-gray-500">
                    Password
                  </label>
                  <input
                    id="datatruck-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Datatruck password"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-gray-500">
                    Your password is used only to authenticate with Datatruck and is not stored by Neuron.
                  </span>
                </div>
              </>
            )}
            </>
            )}

            {connectionMode === 'open_api' && !mfaChallenge && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setIsHelpOpen((current) => !current)}
                className="flex w-full items-center justify-between text-left text-sm font-medium text-gray-800"
              >
                <span>How to find your Datatruck API token</span>
                <span className="text-xs text-gray-500">{isHelpOpen ? 'Hide' : 'Show'}</span>
              </button>
              {isHelpOpen && (
                <div className="mt-3 space-y-3 text-sm text-gray-600">
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Open Datatruck.</li>
                    <li>Go to Settings.</li>
                    <li>Scroll to Developer.</li>
                    <li>Click API Tokens.</li>
                    <li>Click Create if you do not already have a token.</li>
                    <li>Copy your Company name shown on the API Tokens page.</li>
                    <li>Copy your API token.</li>
                    <li>Paste both values here in Neuron.</li>
                  </ol>
                  <p>Your company name is shown in Datatruck on the API Tokens page. It is also the first part of your Datatruck URL.</p>
                  <div className="rounded-md bg-white p-3 text-xs text-gray-600">
                    <p>https://sflogistics.datatruck.io → company name is sflogistics</p>
                  </div>
                  <p className="text-xs font-medium text-gray-700">Neuron stores your token securely and never shows it again after connection.</p>
                </div>
              )}
            </div>
            )}

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
                {mfaChallenge ? 'Verify MFA' : 'Connect Datatruck'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
