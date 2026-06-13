'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import CitationText from './CitationText'
import SourceCard, { type SourceItem } from './SourceCard'

interface Props {
  answer: string
  sources: SourceItem[]
  complete: boolean
  copied: boolean
  onCopy: () => void
}

const WEAK_ANSWER = 'I could not find enough information to answer confidently, but these are the closest sources I found.'

export default function QueryResults({ answer, sources, complete, copied, onCopy }: Props) {
  const [expanded, setExpanded] = useState(false)
  const visibleSources = expanded ? sources : sources.slice(0, 3)
  const displayAnswer = answer.trim() || (complete && sources.length > 0 ? WEAK_ANSWER : '')

  return (
    <div className="space-y-4">
      {displayAnswer && (
        <section className="bg-white rounded-lg border border-indigo-100 shadow-sm p-5" aria-label="Answer">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-indigo-700">Answer</h2>
            {complete && (
              <button onClick={onCopy} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
                {copied ? 'Copied!' : 'Copy answer'}
              </button>
            )}
          </div>
          {displayAnswer.toLowerCase().includes('conflict') && (
            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
              Conflict detected in your knowledge base. Review sources for inconsistencies.
            </div>
          )}
          <p className="text-gray-900 text-sm leading-relaxed">
            <CitationText text={displayAnswer} sources={sources} />
          </p>
        </section>
      )}

      {sources.length > 0 && (
        <section aria-label="Top Sources">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Top Sources</h2>
            <span className="text-xs text-gray-400">{sources.length} relevant sources</span>
          </div>
          <motion.ul initial="hidden" animate="visible" className="space-y-2 list-none p-0">
            {visibleSources.map((source, i) => (
              <li key={source.chunkId}>
                <SourceCard source={source} i={i} />
              </li>
            ))}
          </motion.ul>
          {sources.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              {expanded ? 'Show fewer sources' : `Show more sources (${sources.length - 3})`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
