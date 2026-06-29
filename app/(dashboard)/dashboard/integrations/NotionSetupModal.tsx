'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { BrandTile } from '@/components/BrandLogo'
import { integrationConnectClass } from './IntegrationCardUi'

const steps = [
  {
    title: 'Connect your Notion workspace',
    text: 'Neuron will ask Notion for permission to read the pages you choose. You stay in control of what Neuron can access.',
  },
  {
    title: 'Choose pages',
    text: 'When Notion opens, select the workspace and pages you want Neuron to sync.',
  },
  {
    title: 'Share pages with Neuron',
    text: 'If a page does not appear later, open that page in Notion, click Share, and make sure the Neuron integration has access.',
  },
  {
    title: 'Sync and ask questions',
    text: 'After connecting, return to Neuron and click Sync Now.',
  },
]

interface NotionSetupModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function NotionSetupModal({
  isOpen,
  onClose,
}: NotionSetupModalProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notion-setup-title"
            className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-warm bg-white shadow-2xl"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-warm px-6 py-5">
              <div className="flex items-center gap-3">
                <BrandTile brand="notion" className="h-12 w-12" />
                <div>
                  <h2 id="notion-setup-title" className="text-xl font-display font-semibold text-ink">
                    Set up Notion
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">Choose exactly what Neuron can read.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 px-6 py-5">
              {steps.map((step, index) => (
                <div key={step.title} className="flex gap-3 rounded-xl border border-warm/70 bg-cream/60 p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{step.text}</p>
                  </div>
                  {index < steps.length - 1 && <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted/50" />}
                </div>
              ))}
              <p className="flex items-center gap-2 text-xs text-muted">
                <ShieldCheck className="h-4 w-4 text-positive" />
                Neuron only reads pages you explicitly allow in Notion.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-warm px-6 py-4">
              <button type="button" onClick={onClose} className="h-9 px-3 text-sm font-medium text-muted hover:text-ink">
                Cancel
              </button>
              <a href="/api/integrations/notion/connect" className={integrationConnectClass}>
                Continue to Notion
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
