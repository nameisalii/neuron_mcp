'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { BrandTile, type BrandKey } from '@/components/BrandLogo'
import { Card } from '@/components/ui/card'

type UpcomingIntegrationCardProps = {
  brand: Extract<BrandKey, 'gmail' | 'teams'>
  name: string
  status: string
  description: string
  buttonLabel: string
  modalTitle: string
  modalCopy: string
  requirements: Array<{ label: string; value: string }>
  footer?: string
}

export default function UpcomingIntegrationCard({
  brand,
  name,
  status,
  description,
  buttonLabel,
  modalTitle,
  modalCopy,
  requirements,
  footer,
}: UpcomingIntegrationCardProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="relative overflow-hidden rounded-xl">
        <div className="pointer-events-none opacity-45" aria-hidden="true" inert>
          <Card padding="md" className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3.5">
                <BrandTile brand={brand} className="h-12 w-12" />
                <div className="min-w-0">
                  <h3 className="text-lg font-display font-semibold text-ink">{name}</h3>
                  <p className="mt-0.5 text-xs text-muted">Upcoming integration</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">{status}</span>
            </div>
            <p className="mt-5 min-h-16 flex-1 text-sm text-muted">{description}</p>
            <div className="mt-5 border-t border-warm/60 pt-4">
              <span className="inline-flex h-9 items-center rounded-[10px] border border-warm px-3 text-sm font-medium text-ink">{buttonLabel}</span>
            </div>
          </Card>
        </div>
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/35 backdrop-blur-[2px]">
          <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-warm bg-white px-5 py-2 text-sm font-semibold text-ink shadow-soft transition-colors hover:bg-cream">
            {buttonLabel}
          </button>
        </div>
      </div>

      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby={`${brand}-upcoming-title`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-warm bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Upcoming</p>
                <h2 id={`${brand}-upcoming-title`} className="mt-1 text-xl font-display font-semibold text-ink">{modalTitle}</h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:bg-cream hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">{modalCopy}</p>
            <dl className="mt-5 space-y-3 rounded-xl border border-warm bg-cream/60 p-4">
              {requirements.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{item.label}</dt>
                  <dd className="mt-1 break-words text-sm text-ink">{item.value}</dd>
                </div>
              ))}
            </dl>
            {footer ? <p className="mt-4 text-sm text-muted">{footer}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
