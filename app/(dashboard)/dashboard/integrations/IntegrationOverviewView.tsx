'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowLeft, BookmarkPlus, CheckCircle, ChevronRight, ExternalLink, FileText, Search, Truck, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { BrandTile, type BrandKey } from '@/components/BrandLogo'
import KnowledgeCard from '@/components/KnowledgeCard'
import { INTEGRATION_FILTERS, type DatatruckEndpointCoverage, type IntegrationOverviewData } from '@/lib/integrations/overview'
import { clsx } from 'clsx'
import DatatruckSetupModal from './DatatruckSetupModal'
import AddKnowledgeModal from './AddKnowledgeModal'
import ConnectSourceModal from './ConnectSourceModal'
import { integrationConnectClass } from './IntegrationCardUi'
import TruckIntegrationLogo from '@/components/TruckIntegrationLogo'

function manualMetadataOf(item: { sourceMetadata?: unknown }): Record<string, unknown> | null {
  const metadata = item.sourceMetadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  return (metadata as Record<string, unknown>).manual === true ? metadata as Record<string, unknown> : null
}

interface Props {
  data: IntegrationOverviewData
}

const BRAND_SOURCES = new Set<BrandKey>(['slack', 'notion', 'linear', 'gmail', 'discord', 'granola', 'telegram', 'teams', 'jira', 'whatsapp'])
const DATATRUCK_CORE_ENDPOINTS = new Set(['loads', 'drivers', 'trucks', 'trailers', 'workOrders', 'dispatcherBoard'])

function asBrandKey(source: string): BrandKey | null {
  const normalized = source.toLowerCase()
  return BRAND_SOURCES.has(normalized as BrandKey) ? (normalized as BrandKey) : null
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(iso).toLocaleDateString()
}

function normalizeEndpointPath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function endpointPathLabel(endpoint: DatatruckEndpointCoverage): string {
  if (endpoint.path) return endpoint.path
  return endpoint.configuredBy === 'not_mapped' ? 'Not available via current API' : 'Endpoint not configured'
}

function endpointStatusLabel(endpoint: DatatruckEndpointCoverage): string {
  if (endpoint.status === 'failed') return 'Failed'
  if (endpoint.status === 'not_mapped') {
    return endpoint.configuredBy === 'not_mapped' ? 'Not available via current API' : 'Endpoint not configured'
  }
  return endpoint.fetched === null ? 'Connected' : 'Synced'
}

function endpointSourceLabel(endpoint: DatatruckEndpointCoverage): string {
  if (endpoint.configuredBy === 'default') return 'Official API'
  if (endpoint.configuredBy === 'metadata') return 'Custom endpoint'
  if (endpoint.configuredBy === 'env') return 'Environment endpoint'
  return 'Unconfirmed'
}

export default function IntegrationOverviewView({ data }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(data.items)
  const [overrides, setOverrides] = useState<Record<string, { from: string; to: string }>>({})
  const [isDatatruckSetupOpen, setIsDatatruckSetupOpen] = useState(false)
  const [isAddKnowledgeOpen, setIsAddKnowledgeOpen] = useState(false)
  const [connectSourceKey, setConnectSourceKey] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const initialEndpointMapping = useMemo(() => Object.fromEntries(
    (data.datatruckCoverage ?? [])
      .filter((endpoint) => endpoint.configuredBy === 'metadata' && endpoint.path)
      .map((endpoint) => [endpoint.key, endpoint.path ?? '']),
  ), [data.datatruckCoverage])
  const [endpointMapping, setEndpointMapping] = useState<Record<string, string>>(() => initialEndpointMapping)
  const [isAdvancedMappingOpen, setIsAdvancedMappingOpen] = useState(false)
  const [isTutorialOpen, setIsTutorialOpen] = useState(false)
  const [isEditingCoreEndpoints, setIsEditingCoreEndpoints] = useState(false)
  const [isSavingEndpointMapping, setIsSavingEndpointMapping] = useState(false)
  const [endpointMappingMessage, setEndpointMappingMessage] = useState<string | null>(null)
  const [endpointTestResults, setEndpointTestResults] = useState<Record<string, { ok: boolean; message: string; details?: string }>>({})
  const [testingEndpointKey, setTestingEndpointKey] = useState<string | null>(null)
  const categoryCounts = useMemo(() => {
    const next = { ...data.categoryCounts }
    for (const change of Object.values(overrides)) {
      if (change.from === change.to) continue
      if (change.from in next) next[change.from as keyof typeof next]--
      if (change.to in next) next[change.to as keyof typeof next]++
    }
    return next
  }, [data.categoryCounts, overrides])
  const filterOptions = INTEGRATION_FILTERS.map((filter) => ({
    ...filter,
    active: filter.key === data.filter,
  }))
  const activeCategory = filterOptions.find((filter) => filter.active)?.category
  const categoryItems = activeCategory ? items.filter((item) => item.category === activeCategory) : items
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const visibleItems = normalizedSearch
    ? categoryItems.filter((item) => [
      item.title,
      item.content,
      item.owner,
      item.category,
      ...(item.sourceLabels ?? []),
    ].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedSearch)))
    : categoryItems
  const brand = asBrandKey(data.source)
  const summaryCards = data.summaryCards.map((card) => {
    const normalized = card.label.toLowerCase()
    if (normalized === 'decisions') return { ...card, value: String(categoryCounts.decision ?? 0) }
    if (normalized === 'rules') return { ...card, value: String(categoryCounts.rule ?? 0) }
    if (normalized === 'ideas') return { ...card, value: String(categoryCounts.idea ?? 0) }
    if (normalized === 'processes') return { ...card, value: String(categoryCounts.process ?? 0) }
    if (normalized === 'facts') return { ...card, value: String(categoryCounts.fact ?? 0) }
    if (normalized === 'status updates') return { ...card, value: String(categoryCounts.status_update ?? 0) }
    return card
  })
  const cleanedEndpointMapping = useMemo(() => Object.fromEntries(
    Object.entries(endpointMapping)
      .map(([key, value]) => [key, normalizeEndpointPath(value)] as const)
      .filter(([, value]) => value.length > 0),
  ), [endpointMapping])
  const endpointMappingHasChanges = JSON.stringify(cleanedEndpointMapping) !== JSON.stringify(initialEndpointMapping)
  const datatruckCoverage = data.datatruckCoverage ?? []
  const datatruckCoreCoverage = datatruckCoverage.filter((endpoint) => DATATRUCK_CORE_ENDPOINTS.has(endpoint.key))
  const datatruckOptionalCoverage = datatruckCoverage.filter((endpoint) => !DATATRUCK_CORE_ENDPOINTS.has(endpoint.key))
  const datatruckConnectedCount = datatruckCoverage.filter((endpoint) => endpoint.status !== 'not_mapped').length
  const datatruckNotAvailableCount = datatruckCoverage.filter((endpoint) => endpoint.status === 'not_mapped').length

  function handleCategoryChange(id: string, nextCategory: string) {
    setItems((prev) => prev.map((item) => {
      if (item.id !== id) return item
      setOverrides((current) => {
        const original = current[id]?.from ?? item.category
        const updated = { ...current }
        if (original === nextCategory) delete updated[id]
        else updated[id] = { from: original, to: nextCategory }
        return updated
      })
      return { ...item, category: nextCategory, typeOverriddenByUser: true }
    }))
  }

  async function saveEndpointMapping() {
    setIsSavingEndpointMapping(true)
    setEndpointMappingMessage(null)
    try {
      const res = await fetch('/api/integrations/datatruck/configure', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointMapping: cleanedEndpointMapping }),
      })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not save endpoint mapping. Please try again.')
      setEndpointMappingMessage('Endpoint mapping saved.')
      router.refresh()
    } catch (error) {
      setEndpointMappingMessage(error instanceof Error ? error.message : 'Could not save endpoint mapping. Please try again.')
    } finally {
      setIsSavingEndpointMapping(false)
    }
  }

  async function testEndpoint(endpointKey: string) {
    const path = normalizeEndpointPath(endpointMapping[endpointKey] ?? '')
    if (!path) return
    setTestingEndpointKey(endpointKey)
    setEndpointTestResults((current) => ({ ...current, [endpointKey]: { ok: false, message: 'Testing endpoint...' } }))
    try {
      const res = await fetch('/api/integrations/datatruck/test-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const json = await res.json().catch(() => ({})) as {
        error?: string
        httpStatus?: number
        shape?: string
        recordCount?: number
        fieldNames?: string[]
        pagination?: { detected?: boolean }
      }
      if (!res.ok) throw new Error(json.error ?? 'Endpoint test failed.')
      const fields = json.fieldNames?.length ? `Fields: ${json.fieldNames.slice(0, 10).join(', ')}` : null
      const pagination = json.pagination?.detected ? 'Pagination detected.' : null
      setEndpointTestResults((current) => ({
        ...current,
        [endpointKey]: {
          ok: true,
          message: `Success. HTTP ${json.httpStatus ?? res.status}. ${json.recordCount ?? 0} result${json.recordCount === 1 ? '' : 's'} (${json.shape ?? 'unknown'} shape).`,
          details: [fields, pagination].filter(Boolean).join(' '),
        },
      }))
    } catch (error) {
      setEndpointTestResults((current) => ({
        ...current,
        [endpointKey]: {
          ok: false,
          message: error instanceof Error ? error.message : 'Endpoint test failed.',
        },
      }))
    } finally {
      setTestingEndpointKey(null)
    }
  }

  return (
    <div className="w-full space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Link href="/dashboard/integrations" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Integrations
          </Link>
          <div className="flex items-center gap-3">
            {brand ? (
              <BrandTile brand={brand} className="h-12 w-12" />
            ) : data.source === 'five_eld' || data.source === 'datatruck' ? (
              <TruckIntegrationLogo provider={data.source} size={32} />
            ) : null}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{data.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{data.subtitle}</p>
            </div>
          </div>
          {data.privacyNote && (
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
              <CheckCircle className="w-3.5 h-3.5" />
              {data.privacyNote}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAddKnowledgeOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
              Add knowledge
            </button>
            <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', data.connected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600')}>
              <CheckCircle className="w-3 h-3" />
              {data.connected ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-400">Last sync: {timeAgo(data.lastSyncAt)}</p>
          {!data.connected && data.source === 'datatruck' && (
            <button
              type="button"
              onClick={() => setIsDatatruckSetupOpen(true)}
              className={`mt-3 ${integrationConnectClass}`}
            >
              <Truck className="h-3.5 w-3.5" />
              Connect Datatruck
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <Card key={card.label} padding="sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{card.label}</p>
            <p className="mt-2 text-lg font-semibold text-gray-900 break-words">{card.value}</p>
          </Card>
        ))}
      </div>

      {data.details.length > 0 && (
        <Card padding="sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Source details</h2>
            <span className="text-xs text-gray-400">{data.details.length} item{data.details.length === 1 ? '' : 's'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.details.map((detail) => (
              <span key={`${detail.label}:${detail.value}`} className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                <span className="font-medium text-gray-500">{detail.label}:</span>
                <span className="truncate">{detail.value}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {data.source === 'datatruck' && datatruckCoverage.length ? (
        <section className="space-y-4">
          <Card padding="sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Datatruck coverage</h2>
                <p className="mt-1 max-w-2xl text-xs text-gray-500">
                  Neuron automatically syncs Datatruck's core modules. Connect additional modules through a discovered API endpoint or a file import.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                {datatruckCoreCoverage.length} official modules connected
              </span>
            </div>

            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Core Datatruck data</h3>
            <div className="mb-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {datatruckCoreCoverage.map((endpoint) => (
                <div key={endpoint.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle className={clsx('h-3.5 w-3.5', endpoint.status === 'failed' ? 'text-red-400' : 'text-green-500')} />
                  <span className="font-medium">{endpoint.label}</span>
                  {typeof endpoint.fetched === 'number' && <span className="text-xs text-gray-400">{endpoint.fetched} records</span>}
                </div>
              ))}
            </div>

            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Additional modules</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase text-gray-400">
                    <th className="py-2 pr-3 font-medium">Module</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Records</th>
                    <th className="py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {datatruckOptionalCoverage.map((endpoint) => {
                    const isConnected = endpoint.coverageStatus !== 'not_connected'
                    return (
                      <tr key={endpoint.key} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-3 font-medium text-gray-800">{endpoint.label}</td>
                        <td className="py-2 pr-3 text-xs text-gray-500">
                          {endpoint.sourceLabel}
                          {endpoint.coverageStatus === 'custom_api' && endpoint.path ? (
                            <span className="ml-1 font-mono text-[11px] text-gray-400">{endpoint.path}</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          {isConnected ? (
                            <span className={clsx(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                              endpoint.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700',
                            )}
                            >
                              {endpoint.coverageStatus === 'file_import' ? 'Imported' : endpoint.status === 'failed' ? 'Failed' : 'Synced'}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {endpoint.coverageStatus === 'file_import'
                            ? endpoint.fileImported
                            : isConnected
                              ? endpoint.fetched ?? '—'
                              : '—'}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => setConnectSourceKey(endpoint.key)}
                            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                          >
                            {isConnected ? 'Manage source' : 'Connect source'}
                          </button>
                          {endpoint.lastError ? (
                            <p className="mt-1 max-w-[220px] truncate text-[11px] text-red-500">{endpoint.lastError}</p>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {data.connected ? (
            <Card padding="sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Advanced endpoint mapping</h2>
                  <p className="mt-1 max-w-2xl text-xs text-gray-500">
                    Optional. Add extra Datatruck API paths only if you know them from Datatruck API docs or Chrome DevTools Network.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdvancedMappingOpen((current) => !current)}
                  className="shrink-0 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {isAdvancedMappingOpen ? 'Hide advanced mapping' : 'Show advanced mapping'}
                </button>
              </div>
              {!isAdvancedMappingOpen ? (
                <p className="mt-3 text-xs text-gray-500">
                  Company name and API token are enough for the default Datatruck sync. Use advanced mapping only to add confirmed paths for extra modules.
                </p>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <button
                      type="button"
                      onClick={() => setIsTutorialOpen((current) => !current)}
                      className="flex w-full items-center justify-between text-left text-sm font-medium text-gray-800"
                    >
                      <span>How to find Datatruck endpoint paths</span>
                      <span className="text-xs text-gray-500">{isTutorialOpen ? 'Hide' : 'Show'}</span>
                    </button>
                    {isTutorialOpen && (
                      <div className="mt-3 space-y-3 text-sm text-gray-600">
                        <ol className="list-decimal space-y-1 pl-5">
                          <li>Open the Datatruck page you want to sync.</li>
                          <li>Open Chrome DevTools.</li>
                          <li>Go to the Network tab.</li>
                          <li>Filter by Fetch/XHR.</li>
                          <li>Refresh the Datatruck page.</li>
                          <li>Click the API request.</li>
                          <li>Copy the path after /api/v1/openapi.</li>
                          <li>Paste it here and click Test endpoint.</li>
                          <li>Save mapping if the test succeeds.</li>
                        </ol>
                        <div className="rounded-md bg-white p-3 text-xs text-gray-600">
                          <p>Full URL: https://yourcompany.datatruck.io/api/v1/openapi/confirmed/path/</p>
                          <p>Endpoint path: /confirmed/path/</p>
                        </div>
                        <p className="text-xs font-medium text-gray-700">Never paste your API token into endpoint fields.</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">Core endpoints</h3>
                      <button
                        type="button"
                        onClick={() => setIsEditingCoreEndpoints((current) => !current)}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        {isEditingCoreEndpoints ? 'Lock core endpoints' : 'Edit core endpoints'}
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {datatruckCoreCoverage.map((endpoint) => (
                        <div key={endpoint.key} className="space-y-1">
                          <label htmlFor={`datatruck-endpoint-${endpoint.key}`} className="text-xs font-medium text-gray-500">{endpoint.label}</label>
                          <div className="flex gap-2">
                            <input
                              id={`datatruck-endpoint-${endpoint.key}`}
                              value={endpointMapping[endpoint.key] ?? ''}
                              onChange={(event) => setEndpointMapping((current) => ({ ...current, [endpoint.key]: event.target.value }))}
                              placeholder={endpoint.path ?? 'Paste endpoint path after /api/v1/openapi'}
                              disabled={!isEditingCoreEndpoints}
                              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-500"
                            />
                          </div>
                          {!isEditingCoreEndpoints && <p className="text-xs text-gray-400">Using confirmed default: {endpoint.path}</p>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900">Optional modules</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {datatruckOptionalCoverage.map((endpoint) => {
                        const fieldValue = endpointMapping[endpoint.key] ?? ''
                        const normalizedValue = normalizeEndpointPath(fieldValue)
                        const result = endpointTestResults[endpoint.key]
                        return (
                          <div key={endpoint.key} className="space-y-1">
                            <label htmlFor={`datatruck-endpoint-${endpoint.key}`} className="text-xs font-medium text-gray-500">{endpoint.label}</label>
                            <div className="flex gap-2">
                              <input
                                id={`datatruck-endpoint-${endpoint.key}`}
                                value={fieldValue}
                                onChange={(event) => setEndpointMapping((current) => ({ ...current, [endpoint.key]: event.target.value }))}
                                placeholder="Paste confirmed endpoint path after /api/v1/openapi"
                                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                              />
                              {normalizedValue ? (
                                <button
                                  type="button"
                                  onClick={() => testEndpoint(endpoint.key)}
                                  disabled={testingEndpointKey === endpoint.key}
                                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {testingEndpointKey === endpoint.key ? 'Testing' : 'Test'}
                                </button>
                              ) : null}
                            </div>
                            {result ? (
                              <div className={clsx('rounded-md px-3 py-2 text-xs', result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
                                <p className="font-medium">{result.message}</p>
                                {result.details && <p className="mt-1 text-[11px]">{result.details}</p>}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={saveEndpointMapping}
                      disabled={isSavingEndpointMapping || !endpointMappingHasChanges}
                      className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save mapping
                    </button>
                    {endpointMappingMessage && <span className="text-xs text-gray-500">{endpointMappingMessage}</span>}
                  </div>
                </div>
              )}
            </Card>
          ) : null}
        </section>
      ) : null}

      {data.source === 'notion' && (
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">All Notion projects</h2>
              <p className="text-sm text-gray-500 mt-0.5">Every synced page you can access.</p>
            </div>
            <span className="text-xs text-gray-400">
              {data.notionProjects?.length ?? 0} project{data.notionProjects?.length === 1 ? '' : 's'}
            </span>
          </div>
          {data.notionProjects?.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.notionProjects.map((project) => (
                <Link
                  key={project.id}
                  href="/dashboard/knowledge"
                  className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <h3 className="font-medium text-gray-900 truncate group-hover:text-brand-600 transition-colors">
                        {project.title}
                      </h3>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 group-hover:text-brand-500" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {project.knowledgeCount} knowledge items · {project.chunkCount} chunks
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Card padding="md">
              <p className="text-sm text-gray-500">No Notion projects have been synced yet.</p>
            </Card>
          )}
        </section>
      )}

      {data.source === 'gmail' && items.length > 0 && (
        <section aria-label="Search Gmail memory">
          <label htmlFor="gmail-memory-search" className="mb-2 block text-sm font-semibold text-gray-900">
            Search synced Gmail memory
          </label>
          <div className="relative max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              id="gmail-memory-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search people, companies, subjects, interviews, or keywords"
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-10 text-sm text-gray-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear Gmail search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          {normalizedSearch && (
            <p className="mt-2 text-xs text-gray-500" aria-live="polite">
              {visibleItems.length} matching item{visibleItems.length === 1 ? '' : 's'}
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {filterOptions.map((filter) => (
          <Link
            key={filter.key}
            href={`/dashboard/integrations/${data.source}${filter.key === 'all' ? '' : `?filter=${filter.key}`}`}
            className={clsx(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              filter.active
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            {filter.label}
            <span className="text-xs text-gray-400">{filter.key === 'all' || !filter.category ? data.totalCount : categoryCounts[filter.category] ?? 0}</span>
          </Link>
        ))}
      </div>

      {visibleItems.length > 0 ? (
        <div className="space-y-3">
          {visibleItems.map((item) => {
            const manual = manualMetadataOf(item)
            const documentId = manual && typeof manual.documentId === 'string' ? manual.documentId : null
            const createdByName = manual && typeof manual.createdByName === 'string' ? manual.createdByName : null
            const manualLoadId = manual && typeof manual.externalLoadId === 'string' ? manual.externalLoadId : null
            const manualDocumentType = manual && typeof manual.documentType === 'string' ? manual.documentType : null
            const footerChips = manual ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
                  Manual
                </span>
                {createdByName && <span className="text-xs text-gray-400">Added by {createdByName}</span>}
                {manualLoadId && <span className="text-xs text-gray-500">Load {manualLoadId}</span>}
                {manualDocumentType && <span className="text-xs text-gray-500">{manualDocumentType.replace(/_/g, ' ')}</span>}
                {documentId && (
                  <a
                    href={`/api/documents/${documentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Open document
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </span>
            ) : null
            return (
              <KnowledgeCard
                key={item.id}
                compact
                item={item}
                onCategoryChange={handleCategoryChange}
                footer={footerChips ?? (item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Open source
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null)}
              />
            )
          })}
        </div>
      ) : normalizedSearch ? (
        <Card padding="md">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">No matching Gmail memory</h2>
            <p className="text-sm text-gray-500">Try a person, company, email subject, or a broader keyword.</p>
            <button type="button" onClick={() => setSearchQuery('')} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
              Clear search
            </button>
          </div>
        </Card>
      ) : (
        <Card padding="md">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">{data.emptyState.title}</h2>
            <p className="text-sm text-gray-500 max-w-2xl">{data.emptyState.description}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={data.emptyState.actionHref} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
                {data.emptyState.actionLabel}
              </Link>
              {data.source === 'gmail' && (
                <Link href="/dashboard/integrations?connected=gmail" className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Change Gmail filters
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}

      <DatatruckSetupModal
        isOpen={isDatatruckSetupOpen}
        onClose={() => setIsDatatruckSetupOpen(false)}
        onConfigured={() => {
          setIsDatatruckSetupOpen(false)
          router.refresh()
        }}
      />

      <AddKnowledgeModal
        source={data.source}
        sourceLabel={data.title.replace(/ Overview$/, '')}
        isOpen={isAddKnowledgeOpen}
        onClose={() => setIsAddKnowledgeOpen(false)}
        onSaved={() => {
          setIsAddKnowledgeOpen(false)
          router.refresh()
        }}
      />

      {connectSourceKey ? (
        <ConnectSourceModal
          moduleKey={connectSourceKey}
          moduleLabel={datatruckCoverage.find((endpoint) => endpoint.key === connectSourceKey)?.label ?? connectSourceKey}
          currentMapping={cleanedEndpointMapping}
          isOpen
          onClose={() => setConnectSourceKey(null)}
          onSaved={() => {
            setConnectSourceKey(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
