'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Loader2, PlugZap, X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface ConnectSourceModalProps {
  moduleKey: string
  moduleLabel: string
  currentMapping: Record<string, string>
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

interface EndpointTestResult {
  success: boolean
  httpStatus?: number
  shape?: string
  recordCount?: number
  fieldNames?: string[]
  pagination?: { detected: boolean }
  authAccepted?: boolean
  error?: string | null
}

const IMPORT_EXTENSIONS = new Set(['csv', 'xlsx', 'pdf', 'txt', 'md'])
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const TUTORIAL_STEPS = [
  'Open the Datatruck module, for example Invoices.',
  'Open Chrome DevTools.',
  'Open the Network tab.',
  'Select Fetch/XHR.',
  'Reload the page.',
  'Click requests until you find one returning the records shown on the page.',
  'Copy the Request URL.',
  'Paste the full URL here.',
  'Click Test.',
]

export default function ConnectSourceModal({ moduleKey, moduleLabel, currentMapping, isOpen, onClose, onSaved }: ConnectSourceModalProps) {
  const [mounted, setMounted] = useState(false)
  const [method, setMethod] = useState<'api' | 'file'>('api')
  const [endpoint, setEndpoint] = useState('')
  const [testResult, setTestResult] = useState<EndpointTestResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTutorialOpen, setIsTutorialOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!isOpen) return
    setMethod('api')
    setEndpoint('')
    setTestResult(null)
    setFile(null)
    setError(null)
    setIsTutorialOpen(false)
  }, [isOpen])

  async function handleTest() {
    if (!endpoint.trim()) {
      setError('Paste an endpoint path or full Datatruck URL first.')
      return
    }
    setIsTesting(true)
    setError(null)
    setTestResult(null)
    try {
      const res = await fetch('/api/integrations/datatruck/test-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: endpoint.trim() }),
      })
      const json = (await res.json()) as EndpointTestResult & { error?: string }
      setTestResult(json)
      if (!json.success) setError(json.error ?? 'The endpoint test failed.')
    } catch {
      setError('Could not run the endpoint test. Try again.')
    } finally {
      setIsTesting(false)
    }
  }

  async function handleSaveEndpoint() {
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/datatruck/configure', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointMapping: { ...currentMapping, [moduleKey]: endpoint.trim() } }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not save the source.')
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the source.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleImportFile() {
    if (!file) {
      setError('Choose a CSV, XLSX, PDF, or text file to import.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('title', `${moduleLabel} import: ${file.name}`)
      form.append('description', `Imported ${moduleLabel} data from a file upload.`)
      form.append('category', 'reference')
      form.append('moduleKey', moduleKey)
      form.append('file', file)
      const res = await fetch('/api/integrations/datatruck/knowledge', { method: 'POST', body: form })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not import the file.')
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import the file.')
    } finally {
      setIsSaving(false)
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
          className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-[#1C1A17]" />
              <h3 className="text-lg font-semibold text-gray-900">Connect {moduleLabel}</h3>
            </div>
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
          </div>

          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-gray-600">Choose how Neuron should get {moduleLabel} data from Datatruck.</p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMethod('api')}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${method === 'api' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                API endpoint
              </button>
              <button
                type="button"
                onClick={() => setMethod('file')}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${method === 'file' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                File import
              </button>
            </div>

            {method === 'api' ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Paste a confirmed Datatruck API endpoint path (like <code className="rounded bg-gray-100 px-1">/invoices/list/</code>) or a
                  full HTTPS URL on a datatruck.io domain.
                </p>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => {
                    setEndpoint(e.target.value)
                    setTestResult(null)
                  }}
                  placeholder="/invoices/list/ or https://company.datatruck.io/…"
                  aria-label="Endpoint or full Datatruck URL"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-xs"
                />
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <button
                    type="button"
                    onClick={() => setIsTutorialOpen((current) => !current)}
                    className="flex w-full items-center justify-between text-left text-xs font-medium text-gray-700"
                  >
                    <span>How to find the data request used by Datatruck</span>
                    <span className="text-gray-400">{isTutorialOpen ? 'Hide' : 'Show'}</span>
                  </button>
                  {isTutorialOpen && (
                    <div className="mt-2 space-y-2 text-xs text-gray-600">
                      <ol className="list-decimal space-y-1 pl-4">
                        {TUTORIAL_STEPS.map((step) => <li key={step}>{step}</li>)}
                      </ol>
                      <p className="text-gray-500">
                        Important: the URL may not use /api/v1/openapi, and frontend page URLs (like
                        {' '}<code className="rounded bg-gray-100 px-1">app.datatruck.io/settings/…</code>) are not automatically API endpoints —
                        only the Fetch/XHR request URL that returns the records is.
                      </p>
                    </div>
                  )}
                </div>
                {testResult?.success && (
                  <div className="rounded-md border border-green-100 bg-green-50 p-3 text-xs text-green-800">
                    <p className="font-medium">Test succeeded (HTTP {testResult.httpStatus})</p>
                    <p className="mt-1">
                      Shape: {testResult.shape} · {testResult.recordCount ?? 0} records
                      {testResult.pagination?.detected ? ' · pagination detected' : ''}
                    </p>
                    {testResult.fieldNames && testResult.fieldNames.length > 0 && (
                      <p className="mt-1 text-green-700">Fields: {testResult.fieldNames.slice(0, 8).join(', ')}{testResult.fieldNames.length > 8 ? '…' : ''}</p>
                    )}
                  </div>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => void handleTest()}
                    disabled={isTesting}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveEndpoint()}
                    disabled={isSaving || !testResult?.success}
                    className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-deep disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save source
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Upload a CSV, XLSX, PDF, or text export of {moduleLabel}. Imported files are labeled File import and do not sync live.
                </p>
                {file ? (
                  <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate font-medium">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      aria-label="Remove file"
                      className="ml-auto rounded p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    aria-label="Import file"
                    accept=".csv,.xlsx,.pdf,.txt,.md"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] ?? null
                      if (!selected) return
                      const extension = selected.name.split('.').pop()?.toLowerCase() ?? ''
                      if (!IMPORT_EXTENSIONS.has(extension)) {
                        setError('Unsupported file type. Upload CSV, XLSX, PDF, or text.')
                      } else if (selected.size > MAX_UPLOAD_BYTES) {
                        setError('File is too large. The limit is 10 MB.')
                      } else {
                        setError(null)
                        setFile(selected)
                      }
                      e.target.value = ''
                    }}
                    className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                  />
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => void handleImportFile()}
                    disabled={isSaving || !file}
                    className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-deep disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Import file
                  </button>
                </div>
              </div>
            )}

            <p className="border-t border-gray-100 pt-3 text-xs text-gray-400">
              Webhook ingestion is not available from Datatruck yet.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
