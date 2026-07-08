'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Copy, ExternalLink, FileText } from 'lucide-react'
import CitationText from './CitationText'
import SourceCard, { type SourceItem } from './SourceCard'

export interface DocumentResultItem {
  id: string
  fileName: string
  documentType: string | null
  externalLoadId: string | null
  source: string
  createdAt: string
  sourceUrl: string | null
  storageUrl: string | null
  snippet: string | null
}

interface Props {
  answer: string
  sources: SourceItem[]
  documents?: DocumentResultItem[]
  complete: boolean
  copied: boolean
  onCopy: () => void
}

const WEAK_ANSWER = 'I could not find enough information to answer confidently, but these are the closest sources I found.'

export default function QueryResults({ answer, sources, documents = [], complete, copied, onCopy }: Props) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false)
  const [documentsExpanded, setDocumentsExpanded] = useState(documents.length > 0)
  const displayAnswer = answer.trim() || (complete && sources.length > 0 ? WEAK_ANSWER : '')

  return (
    <div className="space-y-4">
      {displayAnswer && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Neuron answer">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-black">
                <img src="/neuron-assistant-logo.png" alt="" className="h-full w-full object-cover" />
              </span>
              <h2 className="text-sm font-semibold text-gray-900">Neuron</h2>
            </div>
            {complete && (
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Copy answer"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied ? 'Copied!' : 'Copy answer'}
              </button>
            )}
          </div>
          {displayAnswer.toLowerCase().includes('conflict') && (
            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
              Conflict detected in your knowledge base. Review sources for inconsistencies.
            </div>
          )}
          <div className="space-y-3 text-sm leading-7 text-gray-900">
            {displayAnswer.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index} className="whitespace-pre-wrap">
                <CitationText text={paragraph} sources={sources} />
              </p>
            ))}
          </div>
        </section>
      )}

      {documents.length > 0 && (
        <section aria-label="Documents" className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setDocumentsExpanded((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-900"
            aria-expanded={documentsExpanded}
          >
            <span>Documents ({documents.length})</span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${documentsExpanded ? 'rotate-180' : ''}`} />
          </button>
          {documentsExpanded && (
            <div className="space-y-2 border-t border-gray-100 p-3">
              {documents.map((document) => (
                <article key={document.id} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium text-gray-900">{document.fileName}</h3>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {[document.documentType, document.externalLoadId ? `Load ${document.externalLoadId}` : null, document.source].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {document.storageUrl && (
                        <a href={document.storageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                          Open document
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {!document.storageUrl && document.sourceUrl && (
                        <a href={document.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                          Open source
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {document.snippet && <p className="mt-2 text-xs leading-relaxed text-gray-600">{document.snippet}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {sources.length > 0 && (
        <section aria-label="Sources" className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setSourcesExpanded((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-900"
            aria-expanded={sourcesExpanded}
          >
            <span>Sources ({sources.length})</span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${sourcesExpanded ? 'rotate-180' : ''}`} />
          </button>
          {sourcesExpanded && (
            <div className="border-t border-gray-100 p-3">
              <motion.ul initial="hidden" animate="visible" className="space-y-2 list-none p-0">
                {sources.map((source, i) => (
                  <li key={source.chunkId}>
                    <SourceCard source={source} i={i} />
                  </li>
                ))}
              </motion.ul>
              <button
                type="button"
                onClick={() => setSourcesExpanded(false)}
                className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-800"
              >
                Show less
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
