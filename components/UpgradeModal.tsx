'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  onUpgradeComplete: (workspace: { id: string; name: string; type: string }) => void
}

type Step = 'confirm' | 'name' | 'upgrading' | 'done'

interface UpgradeResult {
  workspace: { id: string; name: string; type: string }
  chunksMarkedPersonal: number
}

export default function UpgradeModal({ isOpen, onClose, onUpgradeComplete }: UpgradeModalProps) {
  const [step, setStep] = useState<Step>('confirm')
  const [workspaceName, setWorkspaceName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UpgradeResult | null>(null)

  const handleUpgrade = async () => {
    if (!workspaceName.trim()) {
      setError('Give your team a name')
      return
    }
    setError(null)
    setStep('upgrading')

    try {
      const res = await fetch('/api/workspace/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName.trim() }),
      })
      const data = await res.json() as UpgradeResult & { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Upgrade failed')
        setStep('name')
        return
      }
      setResult(data)
      setStep('done')
      onUpgradeComplete(data.workspace)
    } catch {
      setError('Something went wrong. Try again.')
      setStep('name')
    }
  }

  const handleShareAll = async () => {
    try {
      await fetch('/api/workspace/share-all', { method: 'POST' })
    } catch {
      // non-fatal
    }
    handleClose()
  }

  const handleClose = () => {
    if (step === 'upgrading') return
    setStep('confirm')
    setWorkspaceName('')
    setError(null)
    setResult(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md mx-4 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {step === 'confirm' && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}
              className="p-7"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Add your team</h2>
              <p className="text-sm text-gray-500 mb-5">
                Turn your personal brain into a shared team workspace.
              </p>
              <div className="space-y-3 mb-6">
                {[
                  ['Your existing knowledge stays personal', 'All current items are marked as yours only.'],
                  ['New syncs are shared by default', 'Content added after upgrade is visible to teammates.'],
                  ['You control sharing', 'Share any item with the team whenever you want.'],
                ].map(([title, desc]) => (
                  <div key={title} className="flex gap-3">
                    <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{title}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('name')}
                  className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {step === 'name' && (
            <motion.div
              key="name"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}
              className="p-7"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Name your team</h2>
              <p className="text-xs text-gray-500 mb-5">This is what teammates will see when they join.</p>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => { setWorkspaceName(e.target.value); setError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleUpgrade()}
                placeholder="e.g. Acme Engineering, Neuron HQ"
                maxLength={100}
                autoFocus
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
              />
              {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
              <div className="flex gap-2 justify-end mt-5">
                <button
                  onClick={() => setStep('confirm')}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleUpgrade}
                  disabled={!workspaceName.trim()}
                  className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                >
                  Upgrade to Team
                </button>
              </div>
            </motion.div>
          )}

          {step === 'upgrading' && (
            <motion.div
              key="upgrading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-7 flex flex-col items-center justify-center min-h-[180px] gap-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className="w-7 h-7 border-2 border-gray-900 border-t-transparent rounded-full"
              />
              <p className="text-sm text-gray-500">Setting up your team workspace…</p>
            </motion.div>
          )}

          {step === 'done' && result && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              className="p-7"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-1">You&apos;re all set!</h2>
              <p className="text-sm text-gray-500 mb-4">
                <span className="font-medium text-gray-800">{result.workspace.name}</span> is now a team workspace.
              </p>
              {result.chunksMarkedPersonal > 0 && (
                <p className="text-xs text-gray-400 mb-4">
                  {result.chunksMarkedPersonal} existing knowledge items were marked as personal.
                </p>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-5">
                <p className="text-sm font-medium text-gray-800 mb-1">Share everything with your team?</p>
                <p className="text-xs text-gray-500 mb-2">Make all existing items visible to teammates in one click.</p>
                <button
                  onClick={handleShareAll}
                  className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
                >
                  Share all to team →
                </button>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  I&apos;ll share later
                </button>
                <button
                  onClick={() => { handleClose(); window.location.href = '/dashboard/settings/team' }}
                  className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Invite teammates
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
