'use client'

import Link from 'next/link'
import { Copy, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { adminInstructions } from '../../TeamsIntegrationCard'

export default function MicrosoftAdminRequiredPage() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <Card padding="lg">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-amber-700" />
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-display font-semibold text-ink">Administrator approval required</h1>
              <p className="mt-2 text-sm text-muted">Microsoft account connected.</p>
            </div>

            <p className="text-sm text-muted">Teams message sync requires administrator approval from your Microsoft 365 organization.</p>
            <p className="text-sm text-muted">Your organization controls access to Teams channel data. Ask your Microsoft 365 admin to approve Neuron, or connect a workspace where you have permission.</p>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {adminInstructions}
            </div>

            <div className="flex flex-wrap gap-3">
              <a href="/api/integrations/teams/connect?level=teams" className="inline-flex h-10 items-center rounded-[10px] bg-ink px-4 text-sm font-medium text-white hover:bg-ink/90">
                Try another Microsoft account
              </a>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(adminInstructions)}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-warm px-4 text-sm font-medium text-ink hover:bg-cream"
              >
                <Copy className="h-4 w-4" />
                Copy admin approval instructions
              </button>
              <Link href="/dashboard/integrations" className="inline-flex h-10 items-center rounded-[10px] border border-warm px-4 text-sm font-medium text-ink hover:bg-cream">
                Back to Integrations
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
