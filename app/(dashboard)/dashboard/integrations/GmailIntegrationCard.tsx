'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, Mail, ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import SyncButton from './SyncButton'
import GmailSetupModal from './GmailSetupModal'

export type GmailMetadata = {
  status?: string
  configured?: boolean
  privacy?: 'personal'
  selectedLabels?: string[]
  selectedLabelNames?: string[]
  timeWindow?: number
  syncFrom?: string | null
  senderFilter?: string[]
  excludeFilter?: string[]
  maxMessages?: number
}

interface GmailIntegrationCardProps {
  createdAt?: string | null
  lastSyncAt?: string | null
  metadata: GmailMetadata | null
  autoOpenSetup?: boolean
}

export default function GmailIntegrationCard({
  createdAt,
  lastSyncAt,
  metadata,
  autoOpenSetup = false,
}: GmailIntegrationCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!autoOpenSetup) return
    setIsOpen(true)
    window.history.replaceState(null, '', '/dashboard/integrations')
  }, [autoOpenSetup])

  const connected = Boolean(metadata)
  const configured = Boolean(metadata?.configured && (metadata.selectedLabels?.length ?? 0) > 0)
  const selectedLabelSummary = useMemo(() => {
    const labels = metadata?.selectedLabelNames?.length
      ? metadata.selectedLabelNames
      : metadata?.selectedLabels ?? []
    return labels.slice(0, 4).join(', ')
  }, [metadata])

  return (
    <>
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white border border-gray-200 flex items-center justify-center">
                <Image src="/icons/gmail.png" alt="Gmail" width={28} height={28} />
              </div>
              <div>
                <CardTitle>Gmail</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  Sync selected emails into your private Neuron memory.
                </p>
              </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <Link
                  href="/dashboard/integrations/gmail"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View
                </Link>
                {configured ? (
                  <SyncButton endpoint="/api/integrations/gmail/sync" showReset resetType="gmail" resultLabel="threads" onNeedsReconfigure={() => setIsOpen(true)} />
                ) : (
                  <SyncButton endpoint="/api/integrations/gmail/sync" showReset resetType="gmail" resultLabel="threads" syncEnabled={false} />
                )}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                  <CheckCircle className="w-3 h-3" />
                  Connected
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                <Mail className="w-3 h-3" />
                Not connected
              </span>
              )}
            </div>
          </div>
        </CardHeader>

        <div className="space-y-3 text-sm text-gray-600">
          {!connected && (
            <p>Neuron reads selected Gmail labels and turns important emails into private, searchable memory.</p>
          )}
          {connected && !configured && (
            <p>Choose labels before syncing. Gmail stays personal by default.</p>
          )}
          {connected && configured && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Last synced</p>
                <p className="font-medium text-gray-700">{lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Never'}</p>
              </div>
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Privacy</p>
                <p className="font-medium text-gray-700">Personal</p>
              </div>
              <div className="bg-gray-50 rounded-md px-3 py-2 col-span-2">
                <p className="text-xs text-gray-400 mb-0.5">Labels</p>
                <p className="font-medium text-gray-700">{selectedLabelSummary || 'Configured labels'}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              {connected ? 'Configure Gmail' : 'Connect Gmail'}
            </button>
          </div>

          {connected && createdAt && (
            <div className="text-xs text-gray-400">
              Connected {new Date(createdAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </Card>

      <GmailSetupModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfigured={() => {
          setIsOpen(false)
          router.refresh()
        }}
        connected={connected}
        initialStep={connected ? 1 : 0}
        metadata={metadata}
      />
    </>
  )
}
