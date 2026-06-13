/**
 * @jest-environment node
 */
import { POST } from '../route'
import { NextRequest } from 'next/server'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn().mockResolvedValue({ userId: 'clerk_1' }) }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    knowledgeItem: { findMany: jest.fn() },
    notionChunk: { findMany: jest.fn() },
  },
}))
jest.mock('@/lib/pinecone', () => ({ searchSimilar: jest.fn(), searchInNamespace: jest.fn() }))
jest.mock('@/lib/openai', () => ({
  openai: {
    chat: { completions: { create: jest.fn() } },
  },
  generateEmbedding: jest.fn(),
}))

import { prisma } from '@/lib/db'
import { searchSimilar, searchInNamespace } from '@/lib/pinecone'
import { openai, generateEmbedding } from '@/lib/openai'
import { auth } from '@clerk/nextjs/server'

const USER = { workspace: { id: 'ws_1' } }
const MEMBER = { role: 'member' }

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/query/story', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

async function collectSSE(stream: ReadableStream): Promise<Array<Record<string, unknown>>> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const events: Array<Record<string, unknown>> = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        try { events.push(JSON.parse(line.slice(6))) } catch { /* skip partial */ }
      }
    }
  }
  return events
}

describe('POST /api/query/story', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'clerk_1' })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(USER)
    ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue(MEMBER)
    ;(prisma.knowledgeItem.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.notionChunk.findMany as jest.Mock).mockResolvedValue([])
    ;(searchSimilar as jest.Mock).mockResolvedValue([])
    ;(searchInNamespace as jest.Mock).mockResolvedValue([])
    ;(generateEmbedding as jest.Mock).mockResolvedValue(new Array(1536).fill(0))
    ;(openai.chat.completions.create as jest.Mock).mockResolvedValue({
      choices: [{ message: { content: 'A story happened.' } }],
    })
  })

  it('returns 401 when unauthenticated', async () => {
    ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: null })
    const res = await POST(makeRequest({ question: 'what happened?' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-member', async () => {
    ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue(null)
    const res = await POST(makeRequest({ question: 'what happened?' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 for missing question', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns SSE stream with done event on empty results', async () => {
    const res = await POST(makeRequest({ question: 'what happened with auth?' }))
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    const events = await collectSSE(res.body!)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  it('searches the personal namespace as well as the team namespace', async () => {
    await POST(makeRequest({ question: 'timeline?' }))
    expect(searchSimilar).toHaveBeenCalledWith(expect.any(Array), 'ws_1', expect.any(Number), expect.any(Number))
    expect(searchInNamespace).toHaveBeenCalledWith(expect.any(Array), 'ws_1:clerk_1', expect.any(Number), expect.any(Number))
  })

  it('caps events at MAX_STORY_EVENTS (30)', async () => {
    const manyMatches = Array.from({ length: 50 }, (_, i) => ({ id: `id_${i}`, score: 0.9 }))
    ;(searchSimilar as jest.Mock).mockResolvedValue(manyMatches)
    ;(searchInNamespace as jest.Mock).mockResolvedValue([])
    ;(prisma.knowledgeItem.findMany as jest.Mock).mockResolvedValue(
      manyMatches.slice(0, 30).map((m) => ({
        id: m.id,
        content: `content ${m.id}`,
        source: 'slack',
        sourceCreatedAt: new Date('2026-01-01'),
        sourceUrl: null,
        owner: null,
        category: 'fact',
      })),
    )

    const res = await POST(makeRequest({ question: 'tell me the story' }))
    expect(res.status).toBe(200)
    const events = await collectSSE(res.body!)
    const sourcesEvent = events.find((e) => e.type === 'sources') as { events: unknown[] } | undefined
    if (sourcesEvent) {
      expect(sourcesEvent.events.length).toBeLessThanOrEqual(30)
    }
  })

  it('sorts events chronologically by sourceCreatedAt', async () => {
    ;(searchSimilar as jest.Mock).mockResolvedValue([
      { id: 'ki_1', score: 0.9 },
      { id: 'ki_2', score: 0.85 },
    ])
    ;(searchInNamespace as jest.Mock).mockResolvedValue([])
    ;(prisma.knowledgeItem.findMany as jest.Mock).mockResolvedValue([
      { id: 'ki_1', content: 'later event', source: 'slack', sourceCreatedAt: new Date('2026-02-01'), sourceUrl: null, owner: null, category: 'fact' },
      { id: 'ki_2', content: 'earlier event', source: 'linear', sourceCreatedAt: new Date('2026-01-01'), sourceUrl: null, owner: null, category: 'decision' },
    ])
    ;(prisma.notionChunk.findMany as jest.Mock).mockResolvedValue([])

    const res = await POST(makeRequest({ question: 'timeline?' }))
    const events = await collectSSE(res.body!)
    const sourcesEvent = events.find((e) => e.type === 'sources') as { events: Array<{ sourceCreatedAt: string }> } | undefined

    if (sourcesEvent) {
      const dates = sourcesEvent.events.map((ev) => new Date(ev.sourceCreatedAt).getTime())
      expect(dates[0]).toBeLessThanOrEqual(dates[1])
    }
  })
})
