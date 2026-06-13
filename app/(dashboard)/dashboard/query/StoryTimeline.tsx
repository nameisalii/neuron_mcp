'use client'

import { useState } from 'react'
import { RefreshCw, ArrowUpRight, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import BrandLogo, { type BrandKey } from '@/components/BrandLogo'
import { NeuronMark } from '@/components/NeuronLogo'

interface StoryEvent {
  id: string
  source: string
  content: string
  sourceUrl: string | null
  sourceCreatedAt: string | null
}

const BRAND_KEYS = new Set<BrandKey>(['slack', 'notion', 'linear', 'gmail', 'discord'])
function asBrand(source: string): BrandKey | null {
  const s = source.toLowerCase()
  return BRAND_KEYS.has(s as BrandKey) ? (s as BrandKey) : null
}

function sourceLabel(source: string): string {
  return source.charAt(0).toUpperCase() + source.slice(1)
}

function formatDate(iso: string | null): string {
  if (!iso) return 'unknown date'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function StoryTimeline() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [events, setEvents] = useState<StoryEvent[]>([])
  const [narrative, setNarrative] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || loading) return
    setLoading(true)
    setEvents([])
    setNarrative(null)
    setError(null)

    try {
      const res = await fetch('/api/query/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (!res.ok || !res.body) throw new Error('Story request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

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
              events?: StoryEvent[]
              answer?: string
              message?: string
            }
            if (json.type === 'sources') {
              setEvents(json.events ?? [])
            } else if (json.type === 'done') {
              setEvents(json.events ?? [])
              setNarrative(json.answer ?? null)
            } else if (json.type === 'error') {
              setError(json.message ?? 'Story generation failed')
            }
          } catch { /* skip malformed block */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-2 rounded-2xl border border-warm bg-white shadow-soft p-2 pl-5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30 transition-all">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What happened with the auth redesign?"
            disabled={loading}
            className="flex-1 bg-transparent text-ink text-base placeholder:text-muted/70 focus:outline-none disabled:text-muted"
          />
          <button
            type="submit"
            disabled={loading || question.trim().length < 3}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-medium hover:bg-navy-deep shadow-soft hover:shadow-lift hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none transition-all"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Reconstruct</>}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {events.length > 0 && (
        <div className="relative pl-2">
          {/* soft connecting line */}
          <div className="absolute left-[26px] top-3 bottom-3 w-px bg-gradient-to-b from-warm via-warm to-transparent" />
          <div className="space-y-4">
            {events.map((ev, i) => {
              const brand = asBrand(ev.source)
              return (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.08, ease: [0.21, 0.6, 0.35, 1] }}
                  className="relative flex gap-4"
                >
                  {/* branded node */}
                  <div className="relative z-10 shrink-0 w-[52px] h-[52px] rounded-xl bg-white border border-warm shadow-soft flex items-center justify-center overflow-hidden">
                    {brand ? (
                      <BrandLogo brand={brand} className="w-6 h-6" />
                    ) : (
                      <NeuronMark className="w-full h-full" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 bg-white rounded-2xl border border-warm/60 shadow-soft p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-accent-soft text-navy">
                        {sourceLabel(ev.source)}
                      </span>
                      <span className="text-xs text-muted">{formatDate(ev.sourceCreatedAt)}</span>
                      {ev.sourceUrl && (
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
                        >
                          View <ArrowUpRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-ink/90 leading-relaxed line-clamp-3">{ev.content}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      <AnimatePresence>
        {narrative && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.21, 0.6, 0.35, 1] }}
            className="relative overflow-hidden rounded-2xl bg-navy text-white p-6 shadow-lg"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
              </span>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Summary</p>
            </div>
            <p className="text-[15px] text-white/90 leading-relaxed">{narrative}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
