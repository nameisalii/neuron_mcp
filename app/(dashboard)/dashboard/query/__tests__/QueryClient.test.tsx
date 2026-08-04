import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TextDecoder, TextEncoder } from 'util'
import { ReadableStream } from 'stream/web'
import QueryClient from '../QueryClient'

jest.mock('framer-motion', () => {
  const actual = jest.requireActual('framer-motion')
  return { ...actual, useReducedMotion: jest.fn(() => false) }
})

global.TextEncoder = TextEncoder as typeof global.TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder
global.ReadableStream = ReadableStream as typeof global.ReadableStream

function sseResponse(events: Array<Record<string, unknown>>) {
  const encoder = new TextEncoder()
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
        controller.close()
      },
    }),
    json: async () => ({}),
  } as unknown as Response
}

function renderQueryClient() {
  return render(<QueryClient workspaceType="solo" recentQueries={[]} />)
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(sseResponse([
    {
      type: 'sources',
      conversationId: 'conversation-1',
      sources: [
        {
          chunkId: 'source-1',
          pageId: null,
          pageTitle: 'Load board update',
          notionPageId: null,
          content: 'Load 12345 has a BOL.',
          labels: ['dispatch_note'],
          source: 'telegram',
          sourceUrl: 'https://t.me/example/1',
          sourceExternalId: 'telegram-1',
          sourceMetadata: { channelName: '@dispatch_updates' },
          owner: null,
          sourceCreatedAt: '2026-07-05T16:42:00.000Z',
          updatedAt: '2026-07-05T16:42:00.000Z',
          relevanceScore: 0.9,
        },
      ],
      documents: [],
    },
    { type: 'delta', content: 'Neuron found a BOL for load 12345.' },
    { type: 'done', conversationId: 'conversation-1', documents: [] },
  ]))
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn() },
  })
})

it('renders a multiline composer with disabled empty send button', () => {
  renderQueryClient()
  expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recents' })).toBeInTheDocument()
  expect(screen.getByTestId('query-header-controls')).toBeInTheDocument()
  expect(screen.getByTestId('query-thread-scroll')).toHaveClass('overflow-y-auto')
  expect(screen.getByTestId('query-composer')).toBeInTheDocument()
  const textarea = screen.getByRole('textbox', { name: 'Ask Neuron anything' })
  expect(textarea.tagName).toBe('TEXTAREA')
  expect(textarea).toHaveAttribute('rows', '1')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
})

it('shows starter prompts once and copies a chip into the composer', () => {
  renderQueryClient()

  expect(screen.getByText('How can I help you?')).toBeInTheDocument()
  expect(screen.queryByText(/example changes every few seconds/i)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Try asking')).toHaveClass('whitespace-nowrap')
  expect(screen.getAllByRole('button', { name: 'What changed today?' })).toHaveLength(1)

  fireEvent.click(screen.getByRole('button', { name: 'What changed today?' }))
  expect(screen.getByRole('textbox', { name: 'Ask Neuron anything' })).toHaveValue('What changed today?')
})

it('copies a suggested question into the composer', async () => {
  renderQueryClient()

  fireEvent.click(screen.getByRole('button', { name: 'What tasks do I have?' }))

  expect(screen.getByRole('textbox', { name: 'Ask Neuron anything' })).toHaveValue('What tasks do I have?')
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ask Neuron anything' })).toHaveFocus())
})

it('deduplicates recent questions by normalized text', () => {
  render(<QueryClient workspaceType="solo" recentQueries={[
    { id: '1', query: 'What changed today?', createdAt: '2026-07-24T10:00:00.000Z' },
    { id: '2', query: '  WHAT  CHANGED TODAY?  ', createdAt: '2026-07-23T10:00:00.000Z' },
    { id: '3', query: 'What needs attention?', createdAt: '2026-07-22T10:00:00.000Z' },
  ]} />)
  expect(screen.getByLabelText('Recent questions')).toHaveClass('whitespace-nowrap')
  expect(screen.getAllByRole('button', { name: /what changed today\?/i })).toHaveLength(1)
})

it('expands the composer for multiline input', () => {
  renderQueryClient()
  const textarea = screen.getByRole('textbox', { name: 'Ask Neuron anything' }) as HTMLTextAreaElement
  Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 120 })

  fireEvent.change(textarea, { target: { value: 'Line one\nLine two' } })

  return waitFor(() => expect(textarea.style.height).toBe('120px'))
})

it('sends on Enter and renders chat bubbles with collapsed sources', async () => {
  renderQueryClient()
  const textarea = screen.getByRole('textbox', { name: 'Ask Neuron anything' })

  fireEvent.change(textarea, { target: { value: 'Find BOL for load 12345' } })
  fireEvent.keyDown(textarea, { key: 'Enter' })

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/query', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ question: 'Find BOL for load 12345' }),
  })))
  expect(screen.getByText('Find BOL for load 12345')).toBeInTheDocument()
  expect(await screen.findByText('Neuron found a BOL for load 12345.')).toBeInTheDocument()
  const assistantHeader = screen.getByLabelText('Neuron assistant').parentElement!
  expect(assistantHeader.textContent).not.toContain('Neuron')
  expect(assistantHeader.querySelector('time')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'From integrations (1)' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Load board update')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'From integrations (1)' }))
  expect(screen.getByText('Load board update')).toBeInTheDocument()
  expect(screen.getByText(/Telegram · Bot Mode · @dispatch_updates ·/)).toBeInTheDocument()
})

it('keeps Shift+Enter as a newline action instead of submitting', () => {
  renderQueryClient()
  const textarea = screen.getByRole('textbox', { name: 'Ask Neuron anything' })

  fireEvent.change(textarea, { target: { value: 'Long question' } })
  fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

  expect(global.fetch).not.toHaveBeenCalled()
})

it('clears the current thread when New Chat is clicked', async () => {
  renderQueryClient()
  const textarea = screen.getByRole('textbox', { name: 'Ask Neuron anything' })

  fireEvent.change(textarea, { target: { value: 'load' } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
  expect(await screen.findByText('load')).toBeInTheDocument()
  expect(await screen.findByText('Neuron found a BOL for load 12345.')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'New Chat' }))
  await waitFor(() => expect(screen.queryByText('load')).not.toBeInTheDocument())
  expect(screen.getByText('How can I help you?')).toBeInTheDocument()
  expect(global.fetch).not.toHaveBeenCalledWith(expect.stringMatching(/delete|reset/i), expect.anything())
})

it('Recents tab shows conversation history without the old reconstruct UI', async () => {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/chat/conversations?')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          conversations: [
            {
              id: 'history-1',
              title: 'BOL for Load 12345',
              preview: 'Find BOL for load 12345',
              updatedAt: '2026-07-06T12:00:00.000Z',
              relatedLoadId: '12345',
              sourceContext: null,
            },
          ],
        }),
      } as Response)
    }
    return Promise.resolve(sseResponse([]))
  })

  renderQueryClient()
  fireEvent.click(screen.getByRole('button', { name: 'Recents' }))

  expect(screen.queryByText('Reconstruct')).not.toBeInTheDocument()
  expect(screen.queryByPlaceholderText('What happened with the auth redesign?')).not.toBeInTheDocument()
  expect(await screen.findByText('Conversation history')).toBeInTheDocument()
  expect(await screen.findByText('BOL for Load 12345')).toBeInTheDocument()
})

it('Recents tab shows empty state for an empty conversation list', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, conversations: [] }),
  } as Response)

  renderQueryClient()
  fireEvent.click(screen.getByRole('button', { name: 'Recents' }))

  expect(await screen.findByText('No conversations yet.')).toBeInTheDocument()
  expect(screen.getByText('Start a chat in Search and it will appear here.')).toBeInTheDocument()
  expect(screen.queryByText('Could not load conversation history')).not.toBeInTheDocument()
})

it('opens a saved conversation from Recents and continues it in Search', async () => {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/api/chat/conversations?')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          conversations: [
            {
              id: 'history-1',
              title: 'Telegram knowledge',
              preview: 'What does Neuron know about Telegram?',
              updatedAt: '2026-07-06T12:00:00.000Z',
              relatedLoadId: null,
              sourceContext: null,
            },
          ],
        }),
      } as Response)
    }
    if (url === '/api/chat/conversations/history-1') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            id: 'history-1',
            messages: [
              {
                id: 'message-user-1',
                role: 'user',
                content: 'What does Neuron know about Telegram?',
                createdAt: '2026-07-06T12:00:00.000Z',
              },
              {
                id: 'message-assistant-1',
                role: 'assistant',
                content: 'Telegram is connected to Neuron.',
                createdAt: '2026-07-06T12:00:01.000Z',
                sourceReferences: [],
                documentReferences: [],
              },
            ],
          },
        }),
      } as Response)
    }
    if (url === '/api/query') {
      return Promise.resolve(sseResponse([
        { type: 'sources', conversationId: 'history-1', sources: [], documents: [] },
        { type: 'delta', content: 'Follow-up answer.' },
        { type: 'done', conversationId: 'history-1', documents: [] },
      ]))
    }
    return Promise.reject(new Error(`Unexpected fetch ${url} ${init?.method ?? 'GET'}`))
  })

  renderQueryClient()
  fireEvent.click(screen.getByRole('button', { name: 'Recents' }))
  await screen.findByText('Telegram knowledge')
  fireEvent.click(screen.getAllByRole('button', { name: /Telegram knowledge/i })[0])

  expect(await screen.findByText('Telegram is connected to Neuron.')).toBeInTheDocument()
  expect(screen.getByText('What does Neuron know about Telegram?')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Ask Neuron anything' })).toBeInTheDocument()

  fireEvent.change(screen.getByRole('textbox', { name: 'Ask Neuron anything' }), { target: { value: 'What changed?' } })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Ask Neuron anything' }), { key: 'Enter' })

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/query', expect.objectContaining({
    body: JSON.stringify({ question: 'What changed?', conversationId: 'history-1' }),
  })))
})

it('renames a saved conversation from Recents', async () => {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/api/chat/conversations?')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          conversations: [
            {
              id: 'history-1',
              title: 'Old title',
              preview: 'Question preview',
              updatedAt: '2026-07-06T12:00:00.000Z',
              relatedLoadId: null,
              sourceContext: null,
            },
          ],
        }),
      } as Response)
    }
    if (url === '/api/chat/conversations/history-1' && init?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          conversation: {
            id: 'history-1',
            title: 'New title',
            preview: 'Question preview',
            updatedAt: '2026-07-06T12:00:00.000Z',
            relatedLoadId: null,
            sourceContext: null,
          },
        }),
      } as Response)
    }
    return Promise.reject(new Error(`Unexpected fetch ${url}`))
  })

  renderQueryClient()
  fireEvent.click(screen.getByRole('button', { name: 'Recents' }))
  expect(await screen.findByText('Old title')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Rename Old title' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Conversation title' }), { target: { value: 'New title' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save title' }))

  expect(await screen.findByText('New title')).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledWith('/api/chat/conversations/history-1', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({ title: 'New title' }),
  }))
})

it('cancels a conversation rename from Recents', async () => {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/api/chat/conversations?')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          conversations: [
            {
              id: 'history-1',
              title: 'Old title',
              preview: 'Question preview',
              updatedAt: '2026-07-06T12:00:00.000Z',
              relatedLoadId: null,
              sourceContext: null,
            },
          ],
        }),
      } as Response)
    }
    return Promise.reject(new Error(`Unexpected fetch ${url} ${init?.method ?? 'GET'}`))
  })

  renderQueryClient()
  fireEvent.click(screen.getByRole('button', { name: 'Recents' }))
  expect(await screen.findByText('Old title')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Rename Old title' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Conversation title' }), { target: { value: 'Draft title' } })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Conversation title' }), { key: 'Escape' })

  expect(screen.getByText('Old title')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('Draft title')).not.toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledTimes(1)
})

it('shows a safe error when rename fails', async () => {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/api/chat/conversations?')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          conversations: [
            {
              id: 'history-1',
              title: 'Old title',
              preview: 'Question preview',
              updatedAt: '2026-07-06T12:00:00.000Z',
              relatedLoadId: null,
              sourceContext: null,
            },
          ],
        }),
      } as Response)
    }
    if (url === '/api/chat/conversations/history-1' && init?.method === 'PATCH') {
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Could not rename conversation' }),
      } as Response)
    }
    return Promise.reject(new Error(`Unexpected fetch ${url}`))
  })

  renderQueryClient()
  fireEvent.click(screen.getByRole('button', { name: 'Recents' }))
  expect(await screen.findByText('Old title')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Rename Old title' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Conversation title' }), { target: { value: 'New title' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save title' }))

  expect(await screen.findByText('Could not rename conversation')).toBeInTheDocument()
})

it('sends follow-up messages with the active conversationId', async () => {
  renderQueryClient()
  const textarea = screen.getByRole('textbox', { name: 'Ask Neuron anything' })

  fireEvent.change(textarea, { target: { value: 'Find BOL for load 12345' } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
  expect(await screen.findByText('Neuron found a BOL for load 12345.')).toBeInTheDocument()

  fireEvent.change(screen.getByRole('textbox', { name: 'Ask Neuron anything' }), { target: { value: 'Show me more' } })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Ask Neuron anything' }), { key: 'Enter' })

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/query', expect.objectContaining({
    body: JSON.stringify({ question: 'Show me more', conversationId: 'conversation-1' }),
  })))
})
