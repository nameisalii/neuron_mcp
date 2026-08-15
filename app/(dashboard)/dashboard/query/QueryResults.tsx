'use client'

import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Copy, ExternalLink, FileText, ShieldCheck } from 'lucide-react'
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

const WEAK_ANSWER = 'I could not find enough information to answer confidently, but these are the closest references I found.'

function safeHref(value: string): string | null {
  try {
    const url = new URL(value, 'https://app.tryneuron.net')
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') return value
  } catch {
    if (value.startsWith('/')) return value
  }
  return null
}

function InlineMarkdown({ text, sources }: { text: string; sources: SourceItem[] }) {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(<CitationText key={`t-${last}`} text={text.slice(last, match.index)} sources={sources} />)
    const token = match[0]
    const key = `${match.index}-${token}`
    if (token.startsWith('`')) {
      nodes.push(<code key={key} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.92em] text-gray-800">{token.slice(1, -1)}</code>)
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      const href = link ? safeHref(link[2]) : null
      nodes.push(href
        ? <a key={key} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="font-medium text-indigo-600 hover:text-indigo-700">{link?.[1]}</a>
        : <span key={key}>{token}</span>)
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key} className="font-semibold text-gray-950">{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(<em key={key} className="italic">{token.slice(1, -1)}</em>)
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(<CitationText key={`t-${last}`} text={text.slice(last)} sources={sources} />)
  return <>{nodes}</>
}

function isTableBlock(lines: string[]): boolean {
  return lines.length >= 2 && /^\s*\|.+\|\s*$/.test(lines[0]) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[1])
}

function MarkdownAnswer({ answer, sources }: { answer: string; sources: SourceItem[] }) {
  const lines = answer.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (isTableBlock(lines.slice(index, index + 2))) {
      const tableLines: string[] = []
      while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
        tableLines.push(lines[index])
        index += 1
      }
      const rows = tableLines
        .filter((_, rowIndex) => rowIndex !== 1)
        .map((row) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
      const [head, ...body] = rows
      blocks.push(
        <div key={`table-${index}`} className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>{head.map((cell, cellIndex) => <th key={cellIndex} className="px-3 py-2 text-left font-semibold text-gray-700"><InlineMarkdown text={cell} sources={sources} /></th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {body.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-gray-700"><InlineMarkdown text={cell} sources={sources} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const className = level === 1 ? 'text-xl font-semibold' : level === 2 ? 'text-lg font-semibold' : 'text-base font-semibold'
      blocks.push(<h3 key={`h-${index}`} className={`${className} text-gray-950`}><InlineMarkdown text={heading[2]} sources={sources} /></h3>)
      index += 1
      continue
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} className="border-gray-200" />)
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(<blockquote key={`q-${index}`} className="border-l-2 border-gray-300 pl-3 text-gray-600"><InlineMarkdown text={quote.join(' ')} sources={sources} /></blockquote>)
      continue
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: string[] = []
      const itemPattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/
      while (index < lines.length && itemPattern.test(lines[index])) {
        items.push(lines[index].replace(itemPattern, ''))
        index += 1
      }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={`list-${index}`} className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
          {items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} sources={sources} /></li>)}
        </Tag>,
      )
      continue
    }

    if (/^```/.test(line)) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(<pre key={`code-${index}`} className="overflow-x-auto rounded-xl bg-gray-950 p-3 text-xs text-gray-100"><code>{code.join('\n')}</code></pre>)
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^\s*[-*]\s+|^\s*\d+\.\s+|^>\s?|^```|^\s*---+\s*$/.test(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(<p key={`p-${index}`} className="leading-7"><InlineMarkdown text={paragraph.join(' ')} sources={sources} /></p>)
  }

  return <div className="space-y-4 text-sm text-gray-900">{blocks}</div>
}

export default function QueryResults({ answer, sources, documents = [], complete, copied, onCopy }: Props) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false)
  const [documentsExpanded, setDocumentsExpanded] = useState(documents.length > 0)
  const [whyExpanded, setWhyExpanded] = useState(false)
  const displayAnswer = answer.trim() || (complete && sources.length > 0 ? WEAK_ANSWER : '')
  const hasConflicts = sources.some((source) => Boolean(source.conflictNote))
  const hasRecentOrVerified = sources.some((source) => {
    if (source.verified) return true
    const value = source.sourceCreatedAt ?? source.updatedAt
    return value ? Date.now() - new Date(value).getTime() <= 30 * 86_400_000 : false
  })
  const confidenceLabel = sources.length === 0 || hasConflicts
    ? 'Low confidence'
    : hasRecentOrVerified
      ? 'High confidence'
      : 'Medium confidence'

  return (
    <div className="space-y-4">
      {displayAnswer && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Neuron answer">
          <div className="mb-3 flex items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${confidenceLabel === 'High confidence' ? 'bg-emerald-50 text-emerald-700' : confidenceLabel === 'Medium confidence' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{confidenceLabel}</span>{hasConflicts && <span className="text-xs text-amber-700">Some sources may conflict. Review source cards.</span>}</div>
          {complete && (
            <div className="mb-3 flex justify-end gap-2">
              <button type="button" onClick={() => setWhyExpanded(value => !value)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50" aria-expanded={whyExpanded}><ShieldCheck className="h-3.5 w-3.5" />Why does Neuron believe this?</button>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Copy answer"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied ? 'Copied!' : 'Copy answer'}
              </button>
            </div>
          )}
          {whyExpanded && <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm"><p className="font-semibold text-gray-900">{confidenceLabel}</p><p className="mt-1 text-xs text-gray-600">{sources.length ? `Supported by ${sources.length} accessible source${sources.length === 1 ? '' : 's'}. Confidence reflects retrieval quality, verification, freshness, and conflicts.` : 'No supporting workspace evidence was retrieved, so this answer should not be treated as established truth.'}</p>{sources.length > 0 && <ul className="mt-3 space-y-2">{sources.slice(0, 5).map(source => <li key={source.chunkId} className="rounded-lg bg-white p-2 text-xs text-gray-700"><strong>{source.source}</strong>{source.pageTitle ? ` · ${source.pageTitle}` : ''}{source.sourceCreatedAt || source.updatedAt ? ` · ${new Date(source.sourceCreatedAt ?? source.updatedAt!).toLocaleDateString()}` : ''}{source.conflictNote ? <span className="ml-2 text-amber-700">Conflicting evidence</span> : null}</li>)}</ul>}</div>}
          {displayAnswer.toLowerCase().includes('conflict') && (
            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
              I found conflicting saved context. Review the referenced integrations for inconsistencies.
            </div>
          )}
          <MarkdownAnswer answer={displayAnswer} sources={sources} />
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
        <section aria-label="From integrations" className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setSourcesExpanded((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-900"
            aria-expanded={sourcesExpanded}
          >
            <span>From integrations ({sources.length})</span>
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
