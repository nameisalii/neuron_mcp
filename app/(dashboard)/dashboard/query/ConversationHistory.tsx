'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clock, Loader2, MessageSquareText, Pencil, RefreshCw, X } from 'lucide-react'

export interface ConversationSummary {
  id: string
  title: string
  preview: string
  updatedAt: string
  relatedLoadId: string | null
  messageCount?: number
  sourceContext?: unknown
}

interface Props {
  onOpenConversation: (conversationId: string) => void
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function sourceBadge(conversation: ConversationSummary) {
  if (conversation.relatedLoadId) return `Load ${conversation.relatedLoadId}`
  if (conversation.sourceContext && typeof conversation.sourceContext === 'object' && !Array.isArray(conversation.sourceContext)) {
    const source = (conversation.sourceContext as Record<string, unknown>).source
    if (typeof source === 'string' && source.trim()) return source.trim()
  }
  return null
}

export default function ConversationHistory({ onOpenConversation }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const mountedRef = useRef(false)

  const loadConversations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/chat/conversations?limit=30')
      if (!res.ok) throw new Error('Could not load conversation history')
      const json = await res.json() as { conversations?: ConversationSummary[]; data?: ConversationSummary[] }
      if (mountedRef.current) setConversations(json.conversations ?? json.data ?? [])
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Could not load conversation history')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadConversations()
    return () => {
      mountedRef.current = false
    }
  }, [loadConversations])

  function startRename(conversation: ConversationSummary) {
    setEditingId(conversation.id)
    setDraftTitle(conversation.title)
    setError(null)
  }

  function cancelRename() {
    setEditingId(null)
    setDraftTitle('')
  }

  async function saveRename(id: string) {
    const title = draftTitle.trim().slice(0, 80)
    if (!title || renamingId) return
    setRenamingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const json = await res.json().catch(() => ({})) as { conversation?: ConversationSummary; data?: ConversationSummary; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not rename conversation')
      const updated = json.conversation ?? json.data
      setConversations((current) => current.map((conversation) => (
        conversation.id === id ? { ...conversation, title: updated?.title ?? title } : conversation
      )))
      cancelRename()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename conversation')
    } finally {
      setRenamingId(null)
    }
  }

  return (
    <section className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4 overflow-hidden">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Conversation history</h2>
            <p className="mt-1 text-sm text-gray-500">Open a previous chat and continue where you left off.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadConversations()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" aria-hidden="true" />
          Loading conversations...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && conversations.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <MessageSquareText className="mx-auto h-8 w-8 text-gray-300" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-gray-900">No conversations yet.</p>
          <p className="mt-1 text-sm text-gray-500">Start a chat in Search and it will appear here.</p>
        </div>
      )}

      {conversations.length > 0 && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {conversations.map((conversation) => {
            const badge = sourceBadge(conversation)
            const isEditing = editingId === conversation.id
            return (
              <article
                key={conversation.id}
                className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => !isEditing && onOpenConversation(conversation.id)}
                    className="min-w-0 flex-1 text-left"
                    disabled={isEditing}
                  >
                    {isEditing ? (
                      <input
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void saveRename(conversation.id)
                          } else if (event.key === 'Escape') {
                            cancelRename()
                          }
                        }}
                        autoFocus
                        maxLength={80}
                        aria-label="Conversation title"
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    ) : (
                      <h3 className="truncate text-sm font-semibold text-gray-900">{conversation.title || 'Untitled conversation'}</h3>
                    )}
                    {conversation.preview && (
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-500">{conversation.preview}</p>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {badge && (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                        {badge}
                      </span>
                    )}
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void saveRename(conversation.id)}
                          disabled={!draftTitle.trim() || renamingId === conversation.id}
                          aria-label="Save title"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
                        >
                          {renamingId === conversation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          aria-label="Cancel rename"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(conversation)}
                        aria-label={`Rename ${conversation.title || 'conversation'}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-400">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatUpdatedAt(conversation.updatedAt)}
                </p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
