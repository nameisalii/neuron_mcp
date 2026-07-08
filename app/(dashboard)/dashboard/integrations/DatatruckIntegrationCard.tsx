'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Truck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import DatatruckSetupModal from './DatatruckSetupModal'
import {
  DisconnectIntegrationButton,
  IntegrationViewLink,
  integrationConnectClass,
  integrationPrimaryClass,
} from './IntegrationCardUi'

export type DatatruckCardStatus = 'not_connected' | 'ready' | 'connected' | 'sync_error'

interface Props {
  status: DatatruckCardStatus
  companyName: string | null
  lastSyncAt: string | null
  /** Company name from the developer env fallback — used only to prefill the setup modal. */
  envCompanyName?: string | null
}

const statTileClass = 'rounded-xl border border-warm/60 bg-cream px-3.5 py-2.5'
const SYNC_ERROR_MESSAGE = 'Datatruck sync failed. Check API token or permissions.'

function badgeFor(status: DatatruckCardStatus) {
  if (status === 'connected') {
    return <span className="inline-flex shrink-0 rounded-full bg-[#E6F2EC] px-3 py-1 text-sm font-medium text-positive">Connected</span>
  }
  if (status === 'sync_error') {
    return <span className="inline-flex shrink-0 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">Sync error</span>
  }
  if (status === 'ready') {
    return <span className="inline-flex shrink-0 rounded-full bg-cream px-3 py-1 text-sm font-medium text-muted">Ready to connect</span>
  }
  return <span className="inline-flex shrink-0 rounded-full bg-cream px-3 py-1 text-sm font-medium text-muted">Not connected</span>
}

export default function DatatruckIntegrationCard({ status, companyName, lastSyncAt, envCompanyName }: Props) {
  const router = useRouter()
  const [isSetupOpen, setIsSetupOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const isConnected = status === 'connected' || status === 'sync_error'

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/integrations/datatruck/sync', { method: 'POST' })
      const data = (await res.json()) as { success?: boolean; hasMore?: boolean; message?: string; warnings?: string[] }
      if (!res.ok || !data.success) {
        setMessage(SYNC_ERROR_MESSAGE)
      } else {
        setMessage(data.message ?? (data.hasMore
          ? 'Sync in progress — click Sync Now again in a minute to import the remaining records.'
          : 'Sync complete.'))
        router.refresh()
      }
    } catch {
      setMessage(SYNC_ERROR_MESSAGE)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <Card padding="md" className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-warm bg-white shadow-sm">
              <Truck className="h-6 w-6 text-navy" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-display font-semibold text-ink">Datatruck</h3>
              <p className="mt-0.5 text-xs text-muted">
                {isConnected
                  ? 'Datatruck is connected. Neuron can sync load and dispatch data from your Datatruck workspace.'
                  : 'Connect Datatruck to sync loads, drivers, trucks, trailers, work orders, and dispatcher board data into Neuron.'}
              </p>
            </div>
          </div>
          {badgeFor(status)}
        </div>

        <div className="mt-5 flex-1 space-y-3 text-sm text-muted">
          {isConnected ? (
            <div className="grid grid-cols-2 gap-3">
              <div className={statTileClass}>
                <p className="mb-0.5 text-xs text-muted">Company</p>
                <p className="font-medium text-ink">{companyName ?? '—'}</p>
              </div>
              <div className={statTileClass}>
                <p className="mb-0.5 text-xs text-muted">Last synced</p>
                <p className="font-medium text-ink">{lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Never'}</p>
              </div>
            </div>
          ) : (
            <p>Sync loads, drivers, trucks, trailers, work orders, and dispatcher board data.</p>
          )}
          {status === 'sync_error' && <p className="text-xs text-red-600">{SYNC_ERROR_MESSAGE}</p>}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-warm/60 pt-4">
          {isConnected ? (
            <>
              <button type="button" onClick={() => void handleSync()} className={integrationPrimaryClass} disabled={syncing}>
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <IntegrationViewLink href="/dashboard/integrations/datatruck" />
              <DisconnectIntegrationButton type="datatruck" />
            </>
          ) : (
            <button type="button" onClick={() => setIsSetupOpen(true)} className={integrationConnectClass}>
              Connect Datatruck
            </button>
          )}
        </div>
        {message && <p className="mt-3 text-xs text-muted">{message}</p>}
      </Card>

      <DatatruckSetupModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
        onConfigured={() => {
          setIsSetupOpen(false)
          router.refresh()
        }}
        initialCompanyName={envCompanyName ?? null}
      />
    </>
  )
}
