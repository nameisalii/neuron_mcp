'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface StoryEvent {
  id: string
  source: string
  content: string
  sourceUrl: string | null
  sourceCreatedAt: string | null
}

const SOURCE_COLORS: Record<string, string> = {
  slack: 'bg-[#4A154B] text-white',
  notion: 'bg-gray-900 text-white',
  linear: 'bg-[#5E6AD2] text-white',
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
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What happened with the auth redesign?"
          disabled={loading}
          className="flex-1 px-4 py-2.5 rounded-md border border-gray-300 bg-white text-gray-900 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="submit"
          disabled={loading || question.trim().length < 3}
          className="px-5 py-2.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Reconstruct'}
        </button>
      </form>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {events.length > 0 && (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
          <div className="space-y-3 pl-10">
            {events.map((ev) => (
              <div key={ev.id} className="relative">
                <div className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ${SOURCE_COLORS[ev.source]?.split(' ')[0] ?? 'bg-gray-400'}`} />
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[ev.source] ?? 'bg-gray-200 text-gray-700'}`}>
                      {ev.source}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(ev.sourceCreatedAt)}</span>
                    {ev.sourceUrl && (
                      <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline ml-auto">
                        View →
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{ev.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {narrative && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
          <p className="text-xs font-medium text-indigo-600 mb-2">Narrative</p>
          <p className="text-sm text-gray-800 leading-relaxed">{narrative}</p>
        </div>
      )}
    </div>
  )
}
