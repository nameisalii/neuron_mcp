'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import ShimmerCard from './ShimmerCard'
import QueryResults from './QueryResults'
import StoryTimeline from './StoryTimeline'
import type { SourceItem } from './SourceCard'
import type { WorkspaceType } from '@/types'

type QueryState = 'idle' | 'thinking' | 'sources_found' | 'streaming' | 'complete'

const STATUS_MSGS = [
  'Searching your Notion pages...',
  'Scanning Slack conversations...',
  'Cross-referencing knowledge...',
  'Checking sources...',
]

interface Props {
  workspaceType: WorkspaceType
  recentQueries: { id: string; query: string; createdAt: string }[]
}

export default function QueryClient({ recentQueries }: Props) {
  const [storyMode, setStoryMode] = useState(false)
  const [queryState, setQueryState] = useState<QueryState>('idle')
  const [question, setQuestion] = useState('')
  const [sources, setSources] = useState<SourceItem[]>([])
  const [streamText, setStreamText] = useState('')
  const [confidence, setConfidence] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [statusIndex, setStatusIndex] = useState(0)
  const shouldReduceMotion = useReducedMotion()
  const duration = shouldReduceMotion ? 0 : 0.3

  useEffect(() => {
    if (queryState !== 'thinking') return
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MSGS.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [queryState])

  async function executeQuery(q: string) {
    if (!q.trim() || (queryState !== 'idle' && queryState !== 'complete')) return
    setQuestion(q)
    setQueryState('thinking')
    setSources([])
    setStreamText('')
    setConfidence(0)
    setError(null)
    setCopied(false)
    setStatusIndex(0)

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Query failed')
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let isFirstDelta = true

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          if (!block.trimStart().startsWith('data: ')) continue
          try {
            const json = JSON.parse(block.replace(/^data:\s*/, '').trim()) as {
              type: string
              sources?: SourceItem[]
              confidence?: number
              content?: string
              answer?: string
            }
            if (json.type === 'sources') {
              setSources(json.sources ?? [])
              setConfidence(json.confidence ?? 0)
              setQueryState('sources_found')
            } else if (json.type === 'delta') {
              if (isFirstDelta) {
                setQueryState('streaming')
                isFirstDelta = false
              }
              setStreamText((prev) => prev + (json.content ?? ''))
            } else if (json.type === 'done') {
              setStreamText((prev) => prev || (json.answer ?? ''))
              setQueryState('complete')
            }
          } catch {
            // skip malformed SSE block
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setQueryState('idle')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await executeQuery(question)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(streamText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isActive = queryState === 'thinking' || queryState === 'sources_found' || queryState === 'streaming'
  const showAnswer = queryState === 'streaming' || queryState === 'complete'

  void confidence // used in sources SSE, available for future display

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setStoryMode(false)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!storyMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => setStoryMode(true)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${storyMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Story
        </button>
      </div>
      {storyMode ? (
        <StoryTimeline />
      ) : (
      <><form onSubmit={handleSubmit} className="flex gap-3">
        <motion.div
          className="flex-1 rounded-md"
          animate={
            queryState === 'thinking' && !shouldReduceMotion
              ? {
                  boxShadow: [
                    '0 0 0 0 rgba(99,102,241,0)',
                    '0 0 0 8px rgba(99,102,241,0.25)',
                    '0 0 0 0 rgba(99,102,241,0)',
                  ],
                }
              : { boxShadow: '0 0 0 0 rgba(0,0,0,0)' }
          }
          transition={{
            duration: shouldReduceMotion ? 0 : 1.5,
            repeat: queryState === 'thinking' ? Infinity : 0,
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What is our refund policy?"
            disabled={isActive}
            className="w-full px-4 py-2.5 rounded-md border border-gray-300 bg-white text-gray-900 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          />
        </motion.div>
        <button
          type="submit"
          disabled={isActive || question.trim().length < 3}
          className="px-5 py-2.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isActive ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      <AnimatePresence>
        {queryState === 'thinking' && (
          <motion.p
            key="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
            className="text-sm text-gray-500 text-center py-1"
          >
            {STATUS_MSGS[statusIndex]}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {queryState === 'thinking' && (
          <motion.div
            key="shimmers"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
            className="space-y-3"
          >
            <ShimmerCard />
            <ShimmerCard />
            <ShimmerCard />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAnswer && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration }}
          >
            <QueryResults answer={streamText} sources={sources} complete={queryState === 'complete'} copied={copied} onCopy={handleCopy} />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {queryState === 'idle' && recentQueries.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {recentQueries.map((q) => (
            <button
              key={q.id}
              onClick={() => void executeQuery(q.query)}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors truncate max-w-xs"
              title={q.query}
            >
              {q.query}
            </button>
          ))}
        </div>
      )}
      </>)}
    </div>
  )
}
