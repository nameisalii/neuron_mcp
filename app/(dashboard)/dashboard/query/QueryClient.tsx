'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { FileText, Loader2, Paperclip, Plus, SendHorizontal, X } from 'lucide-react'
import ConversationHistory from './ConversationHistory'
import QueryResults, { type DocumentResultItem } from './QueryResults'
import type { SourceItem } from './SourceCard'
import type { WorkspaceType } from '@/types'

type QueryState = 'idle' | 'thinking' | 'sources_found' | 'streaming'
type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  sources?: SourceItem[]
  documents?: DocumentResultItem[]
  complete?: boolean
  attachedFileName?: string
  interpretation?: string
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // Keep in sync with /api/documents/upload
const UPLOAD_ACCEPT = '.pdf,.txt,.md,.csv,.docx,image/*'
const UPLOAD_EXTENSIONS = new Set(['pdf', 'txt', 'md', 'markdown', 'csv', 'log', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'])

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function validateUploadFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!UPLOAD_EXTENSIONS.has(extension)) {
    return 'Unsupported file type. Upload a PDF, text, Markdown, CSV, DOCX, or image file.'
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'File is too large. The limit is 10 MB.'
  }
  return null
}

const STATUS_MSGS = [
  'Searching your Notion pages...',
  'Scanning Slack conversations...',
  'Checking saved context...',
  'Checking integrations...',
]

const STARTER_QUESTIONS = ['What changed today?', 'What tasks do I have?', 'What did we decide?', 'What needs attention?']
interface Props {
  workspaceType: WorkspaceType
  recentQueries: { id: string; query: string; createdAt: string }[]
  initialConversationId?: string | null
  initialPrompt?: string
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function coerceSources(value: unknown): SourceItem[] {
  return Array.isArray(value) ? (value as SourceItem[]) : []
}

function coerceDocuments(value: unknown): DocumentResultItem[] {
  return Array.isArray(value) ? (value as DocumentResultItem[]) : []
}

export default function QueryClient({ recentQueries, initialConversationId = null, initialPrompt = '' }: Props) {
  const [storyMode, setStoryMode] = useState(false)
  const [queryState, setQueryState] = useState<QueryState>('idle')
  const [composerValue, setComposerValue] = useState(initialPrompt)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const [error, setError] = useState<string | null>(null)
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [statusIndex, setStatusIndex] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const threadScrollRef = useRef<HTMLDivElement | null>(null)
  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const duration = shouldReduceMotion ? 0 : 0.25

  useEffect(() => {
    if (queryState !== 'thinking') return
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MSGS.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [queryState])

  async function loadConversation(id: string, options: { switchToSearch?: boolean; updateUrl?: boolean } = {}) {
    try {
      const res = await fetch(`/api/chat/conversations/${id}`)
      if (!res.ok) throw new Error('Could not load conversation')
      const json = await res.json() as {
        conversation?: {
          id: string
          messages?: Array<{
            id: string
            role: string
            content: string
            createdAt: string
            sourceReferences?: unknown
            documentReferences?: unknown
          }>
        }
        data?: {
          id: string
          messages?: Array<{
            id: string
            role: string
            content: string
            createdAt: string
            sourceReferences?: unknown
            documentReferences?: unknown
          }>
        }
      }
      const conversation = json.conversation ?? json.data
      if (!conversation) throw new Error('Conversation not found')
      setConversationId(conversation.id)
      setMessages((conversation.messages ?? [])
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          id: message.id,
          role: message.role as 'user' | 'assistant',
          content: message.content,
          createdAt: message.createdAt,
          sources: coerceSources(message.sourceReferences),
          documents: coerceDocuments(message.documentReferences),
          complete: true,
        })))
      setError(null)
      if (options.switchToSearch) setStoryMode(false)
      if (options.updateUrl && typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/dashboard/query?conversationId=${encodeURIComponent(conversation.id)}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load conversation')
    }
  }

  useEffect(() => {
    const id = initialConversationId
    if (!id) return
    void loadConversation(id)
  }, [initialConversationId])

  function handleOpenConversation(id: string) {
    void loadConversation(id, { switchToSearch: true, updateUrl: true })
  }

  useEffect(() => {
    const container = threadScrollRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages])

  function resizeComposer(value?: string) {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const nextHeight = (value ?? textarea.value).trim() ? Math.max(44, textarea.scrollHeight) : 44
    textarea.style.height = `${Math.min(nextHeight, 220)}px`
  }

  function updateAssistantMessage(id: string, update: Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage)) {
    setMessages((current) => current.map((message) => {
      if (message.id !== id) return message
      return typeof update === 'function' ? update(message) : { ...message, ...update }
    }))
  }

  async function uploadSelectedFile(file: File, message: string): Promise<string> {
    const form = new FormData()
    form.append('file', file)
    form.append('message', message)
    const res = await fetch('/api/documents/upload', { method: 'POST', body: form })
    const data = await res.json() as { error?: string; document?: { id: string } }
    if (!res.ok || !data.document?.id) {
      throw new Error(data.error ?? 'Could not upload the file. Try again.')
    }
    return data.document.id
  }

  async function executeQuery(rawQuestion: string) {
    const q = rawQuestion.trim()
    if (!q || queryState !== 'idle') return
    const fileToUpload = selectedFile

    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: q,
      createdAt: new Date().toISOString(),
      complete: true,
      ...(fileToUpload ? { attachedFileName: fileToUpload.name } : {}),
    }
    const assistantId = createMessageId('assistant')
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      sources: [],
      documents: [],
      complete: false,
    }

    setMessages((current) => [...current, userMessage, assistantMessage])
    setComposerValue('')
    setSelectedFile(null)
    setFileError(null)
    setQueryState('thinking')
    setError(null)
    setPersistenceWarning(null)
    setCopiedMessageId(null)
    setStatusIndex(0)
    requestAnimationFrame(() => resizeComposer(''))

    try {
      let documentIds: string[] | undefined
      if (fileToUpload) {
        documentIds = [await uploadSelectedFile(fileToUpload, q)]
      }
      const payload = {
        question: q,
        ...(conversationId ? { conversationId } : {}),
        ...(documentIds ? { documentIds } : {}),
      }
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        let message = 'Query failed'
        try {
          const data = await res.json() as { error?: string }
          message = data.error ?? message
        } catch {
          // Keep the generic message when the server did not return JSON.
        }
        throw new Error(message)
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
              documents?: DocumentResultItem[]
              conversationId?: string | null
              content?: string
              answer?: string
              interpretation?: string
            }
            if (json.type === 'sources') {
              updateAssistantMessage(assistantId, {
                sources: json.sources ?? [],
                documents: json.documents ?? [],
                interpretation: json.interpretation,
              })
              if (json.conversationId) {
                setConversationId(json.conversationId)
                setPersistenceWarning(null)
              }
              setQueryState('sources_found')
            } else if (json.type === 'delta') {
              if (isFirstDelta) {
                setQueryState('streaming')
                isFirstDelta = false
              }
              updateAssistantMessage(assistantId, (message) => ({
                ...message,
                content: message.content + (json.content ?? ''),
              }))
            } else if (json.type === 'done') {
              updateAssistantMessage(assistantId, (message) => ({
                ...message,
                content: message.content || (json.answer ?? ''),
                documents: json.documents ?? message.documents,
                complete: true,
              }))
              if (json.conversationId) {
                setConversationId(json.conversationId)
                setPersistenceWarning(null)
              }
              setQueryState('idle')
            }
          } catch {
            // Skip malformed SSE block.
          }
        }
      }

      setQueryState('idle')
      updateAssistantMessage(assistantId, { complete: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong while answering. Please check server logs or try again.'
      const friendly = message.includes('Question must') || message.includes('Please enter')
        ? 'Please enter a question.'
        : /file|upload/i.test(message)
          ? message
          : 'Something went wrong while answering. Please check server logs or try again.'
      setError(friendly)
      setQueryState('idle')
      setMessages((current) => current.filter((message) => message.id !== assistantId))
      // Give the user their attachment back so they can retry without re-selecting.
      if (fileToUpload) setSelectedFile(fileToUpload)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await executeQuery(composerValue)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    void executeQuery(composerValue)
  }

  function selectSuggestedQuestion(question: string) {
    setComposerValue(question)
    requestAnimationFrame(() => {
      resizeComposer(question)
      textareaRef.current?.focus()
    })
  }

  async function handleCopy(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content)
    setCopiedMessageId(message.id)
    setTimeout(() => setCopiedMessageId(null), 2000)
  }

  function handleNewChat() {
    if (messages.length > 0 && !conversationId) {
      setPersistenceWarning('This chat was not saved to history. Check server logs before leaving the page.')
    } else {
      setPersistenceWarning(null)
    }
    setConversationId(null)
    setMessages([])
    setComposerValue('')
    setSelectedFile(null)
    setFileError(null)
    setError(null)
    setQueryState('idle')
    setStoryMode(false)
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/dashboard/query')
    requestAnimationFrame(() => resizeComposer(''))
    requestAnimationFrame(() => {
      const container = threadScrollRef.current
      if (container) container.scrollTop = 0
    })
  }

  const isActive = queryState !== 'idle'
  const canSend = composerValue.trim().length > 0 && !isActive
  const uniqueRecentQuestions = [...new Map(recentQueries.map((item) => {
    const question = item.query.trim().replace(/\s+/g, ' ')
    return [question.toLocaleLowerCase(), question]
  })).values()].slice(0, 6)
  const questionChips = uniqueRecentQuestions.length > 0 ? uniqueRecentQuestions : STARTER_QUESTIONS
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div data-testid="query-header-controls" className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setStoryMode(false)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${!storyMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => setStoryMode(true)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${storyMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Recents
          </button>
        </div>
        {!storyMode && (
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Chat
          </button>
        )}
      </div>

      {storyMode ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ConversationHistory onOpenConversation={handleOpenConversation} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <div
            ref={threadScrollRef}
            data-testid="query-thread-scroll"
            className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-gray-50/60 px-3 py-4 sm:px-5"
          >
            <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center gap-5">
              {messages.length === 0 && (
                <div className="flex min-h-[220px] flex-col items-center justify-center px-4 text-center">
                  <p className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">How can I help you?</p>
                  <p className="mt-2 text-sm text-gray-500">Ask about your tasks, decisions, integrations, or saved context.</p>
                </div>
              )}

              <div className="space-y-5">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration }}
                      className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                    >
                      {message.role === 'user' ? (
                        <div className="max-w-[85%] sm:max-w-[72%]">
                          <p className="mb-1 text-right text-xs font-medium text-gray-500">
                            You · {new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                          <div className="rounded-2xl rounded-tr-md bg-indigo-600 px-4 py-3 text-sm leading-6 text-white shadow-sm">
                            {message.attachedFileName && (
                              <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-md bg-indigo-500/60 px-2 py-1 text-xs font-medium text-indigo-50">
                                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                {message.attachedFileName}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full max-w-[92%] sm:max-w-[78%]">
                          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                            <span className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-black" aria-label="Neuron assistant">
                              <img src="/neuron-assistant-logo.png" alt="" className="h-full w-full object-cover" />
                            </span>
                            <span aria-hidden="true">·</span>
                            <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
                          </div>
                          {message.interpretation && (
                            <p className="mb-2 text-xs text-gray-400" data-testid="query-interpretation">
                              Interpreted as: {message.interpretation}
                            </p>
                          )}
                          {message.content || message.complete || (message.sources?.length ?? 0) > 0 ? (
                            <QueryResults
                              answer={message.content}
                              sources={message.sources ?? []}
                              documents={message.documents ?? []}
                              complete={Boolean(message.complete)}
                              copied={copiedMessageId === message.id}
                              onCopy={() => void handleCopy(message)}
                            />
                          ) : (
                            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm">
                              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" aria-hidden="true" />
                              {STATUS_MSGS[statusIndex]}
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={threadEndRef} />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {persistenceWarning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {persistenceWarning}
            </div>
          )}

          {messages.length === 0 && (
            <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1" aria-label={uniqueRecentQuestions.length > 0 ? 'Recent questions' : 'Try asking'}>
              <span className="shrink-0 text-xs font-medium text-gray-400">{uniqueRecentQuestions.length > 0 ? 'Recent' : 'Try asking'}</span>
              {questionChips.map((question) => (
                <button
                  key={question.toLowerCase()}
                  type="button"
                  onClick={() => selectSuggestedQuestion(question)}
                  className="max-w-xs shrink-0 truncate rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200"
                  title={question}
                >
                  {question}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            data-testid="query-composer"
            className="shrink-0 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300"
          >
            {selectedFile && (
              <div className="mb-1 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800">
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate font-medium">{selectedFile.name}</span>
                <span className="shrink-0 text-indigo-500">{formatFileSize(selectedFile.size)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null)
                    setFileError(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  aria-label="Remove file"
                  className="ml-auto rounded p-0.5 text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            {fileError && <p className="mb-1 px-1 text-xs text-red-600">{fileError}</p>}
            <textarea
              ref={textareaRef}
              value={composerValue}
              onChange={(e) => {
                const nextValue = e.target.value
                setComposerValue(nextValue)
                requestAnimationFrame(() => resizeComposer(nextValue))
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask Neuron anything…"
              aria-label="Ask Neuron anything"
              disabled={isActive}
              rows={1}
              className="query-composer-input max-h-[220px] min-h-11 w-full resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400 disabled:text-gray-400 focus:ring-0"
            />
            <div className="-mt-1 flex items-center justify-end gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept={UPLOAD_ACCEPT}
                className="hidden"
                aria-label="Attach file"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  if (!file) return
                  const validationError = validateUploadFile(file)
                  if (validationError) {
                    setFileError(validationError)
                    setSelectedFile(null)
                  } else {
                    setFileError(null)
                    setSelectedFile(file)
                  }
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isActive}
                aria-label="Attach file"
                title="Attach a file"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isActive ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
