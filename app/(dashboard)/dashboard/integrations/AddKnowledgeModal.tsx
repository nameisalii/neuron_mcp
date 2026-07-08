'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookmarkPlus, FileText, Loader2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { KNOWLEDGE_CATEGORY_OPTIONS } from '@/lib/knowledge/categories'

interface AddKnowledgeModalProps {
  source: string
  sourceLabel: string
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

const DOCUMENT_TYPES = ['BOL', 'POD', 'RATE_CONFIRMATION', 'INVOICE', 'LUMPER_RECEIPT', 'OTHER'] as const
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const UPLOAD_EXTENSIONS = new Set(['pdf', 'txt', 'md', 'markdown', 'csv', 'log', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'])

function validateFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!UPLOAD_EXTENSIONS.has(extension)) {
    return 'Unsupported file type. Upload a PDF, text, Markdown, CSV, DOCX, or image file.'
  }
  if (file.size > MAX_UPLOAD_BYTES) return 'File is too large. The limit is 10 MB.'
  return null
}

export default function AddKnowledgeModal({ source, sourceLabel, isOpen, onClose, onSaved }: AddKnowledgeModalProps) {
  const [mounted, setMounted] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('fact')
  const [externalLoadId, setExternalLoadId] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDatatruck = source === 'datatruck'

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!isOpen) return
    setTitle('')
    setDescription('')
    setCategory('fact')
    setExternalLoadId('')
    setDocumentType('')
    setFile(null)
    setError(null)
  }, [isOpen])

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    if (!description.trim()) {
      setError('Description is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('title', title.trim())
      form.append('description', description.trim())
      form.append('category', category)
      if (isDatatruck && externalLoadId.trim()) form.append('externalLoadId', externalLoadId.trim())
      if (isDatatruck && documentType) form.append('documentType', documentType)
      if (file) form.append('file', file)

      const res = await fetch(`/api/integrations/${source}/knowledge`, { method: 'POST', body: form })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not save knowledge')
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save knowledge')
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
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <BookmarkPlus className="h-4 w-4 text-[#1C1A17]" />
              <h3 className="text-lg font-semibold text-gray-900">Add knowledge to {sourceLabel}</h3>
            </div>
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
          </div>

          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-gray-600">
              Save a verified note, rule, process, decision, or document under this integration.
              Neuron will make it searchable.
            </p>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Example: Customer requires signed BOL before payment"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write the rule, note, process, decision, or context you want Neuron to remember."
                rows={4}
                className="mt-1 w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                {KNOWLEDGE_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {isDatatruck && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Load ID (optional)</span>
                  <input
                    type="text"
                    value={externalLoadId}
                    onChange={(e) => setExternalLoadId(e.target.value)}
                    placeholder="12345"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Document type (optional)</span>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div>
              <span className="text-xs font-medium text-gray-500">Attachment (optional)</span>
              {file ? (
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
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
                  aria-label="Attach file"
                  accept=".pdf,.txt,.md,.csv,.docx,image/*"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] ?? null
                    if (!selected) return
                    const validationError = validateFile(selected)
                    if (validationError) {
                      setError(validationError)
                    } else {
                      setError(null)
                      setFile(selected)
                    }
                    e.target.value = ''
                  }}
                  className="mt-1 block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between pt-1">
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-deep disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save knowledge
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
