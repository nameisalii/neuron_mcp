import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { TextEncoder as NodeTextEncoder } from 'node:util'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import QueryClient from '../QueryClient'

// jsdom lacks the web streams/encoding APIs the component uses to read SSE.
const StreamCtor = (globalThis.ReadableStream ?? NodeReadableStream) as typeof ReadableStream
if (!globalThis.TextEncoder) {
  (globalThis as Record<string, unknown>).TextEncoder = NodeTextEncoder
}
if (!globalThis.TextDecoder) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (globalThis as Record<string, unknown>).TextDecoder = require('node:util').TextDecoder
}

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const originalFetch = global.fetch

function renderComposer() {
  return render(<QueryClient workspaceType="team" recentQueries={[]} />)
}

function selectFile(file: File) {
  const input = screen.getByLabelText('Attach file', { selector: 'input' })
  fireEvent.change(input, { target: { files: [file] } })
}

function sseResponse() {
  const encoder = new TextEncoder()
  return {
    ok: true,
    body: new StreamCtor({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"done","answer":"Done — attached.","documents":[]}\n\n'))
        controller.close()
      },
    }),
    json: async () => ({}),
  }
}

afterEach(() => {
  global.fetch = originalFetch
})

it('shows the attach button and a removable file chip', () => {
  renderComposer()

  expect(screen.getByRole('button', { name: 'Attach file' })).toBeInTheDocument()

  selectFile(new File(['hello'], 'BOL.pdf', { type: 'application/pdf' }))
  expect(screen.getByText('BOL.pdf')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove file' }))
  expect(screen.queryByText('BOL.pdf')).not.toBeInTheDocument()
})

it('shows a friendly error for unsupported files', () => {
  renderComposer()

  selectFile(new File(['x'], 'malware.exe', { type: 'application/octet-stream' }))

  expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument()
  expect(screen.queryByText('malware.exe')).not.toBeInTheDocument()
})

it('uploads the file first, then sends the query with documentIds', async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, document: { id: 'doc-9' } }) })
    .mockResolvedValueOnce(sseResponse())
  global.fetch = fetchMock as never

  renderComposer()
  selectFile(new File(['hello'], 'BOL.pdf', { type: 'application/pdf' }))
  fireEvent.change(screen.getByLabelText('Ask anything'), { target: { value: 'Attach this as BOL for load 12345' } })
  fireEvent.submit(screen.getByLabelText('Ask anything').closest('form') as HTMLFormElement)

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

  const [uploadUrl, uploadInit] = fetchMock.mock.calls[0]
  expect(uploadUrl).toBe('/api/documents/upload')
  expect(uploadInit.body).toBeInstanceOf(FormData)
  expect((uploadInit.body as FormData).get('message')).toBe('Attach this as BOL for load 12345')

  const [queryUrl, queryInit] = fetchMock.mock.calls[1]
  expect(queryUrl).toBe('/api/query')
  expect(JSON.parse(queryInit.body)).toEqual(expect.objectContaining({
    question: 'Attach this as BOL for load 12345',
    documentIds: ['doc-9'],
  }))

  // The chip is consumed by the send; the file name lives on in the user bubble.
  expect(screen.queryByRole('button', { name: 'Remove file' })).not.toBeInTheDocument()
  expect(screen.getByText('BOL.pdf')).toBeInTheDocument()
})

it('clears the selected file on New Chat', () => {
  renderComposer()

  selectFile(new File(['hello'], 'notes.txt', { type: 'text/plain' }))
  expect(screen.getByText('notes.txt')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /New Chat/ }))
  expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
})
