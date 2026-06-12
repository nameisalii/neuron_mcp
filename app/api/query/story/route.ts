import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { openai, generateEmbedding } from '@/lib/openai'
import { searchSimilar } from '@/lib/pinecone'
import { escapeXml } from '@/lib/utils'

const MAX_STORY_EVENTS = 30
const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

const StorySchema = z.object({
  question: z.string().min(3).max(500),
})

interface StoryEvent {
  id: string
  source: string
  content: string
  sourceUrl: string | null
  owner: string | null
  category: string
  sourceCreatedAt: Date | null
}

function sendSSE(controller: ReadableStreamDefaultController, data: object) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = StorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { question } = parsed.data

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 404 })
  }

  const { id: workspaceId } = user.workspace

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  })
  if (!member || !ALLOWED_ROLES.has(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const embedding = await generateEmbedding(question)
        const matches = await searchSimilar(embedding, workspaceId, MAX_STORY_EVENTS * 2, 0.6)

        if (matches.length === 0) {
          sendSSE(controller, {
            type: 'done',
            answer: 'No relevant information found to reconstruct a story.',
            events: [],
          })
          controller.close()
          return
        }

        const matchIds = matches.map((m) => m.id)

        const [knowledgeItems, notionChunks] = await Promise.all([
          prisma.knowledgeItem.findMany({
            where: { id: { in: matchIds }, workspaceId },
            select: { id: true, content: true, source: true, sourceUrl: true, owner: true, category: true, sourceCreatedAt: true },
          }),
          prisma.notionChunk.findMany({
            where: { pineconeId: { in: matchIds }, workspaceId },
            select: {
              id: true,
              content: true,
              pineconeId: true,
              page: { select: { title: true, lastEditedAt: true } },
            },
          }),
        ])

        const events: StoryEvent[] = [
          ...knowledgeItems.map((ki) => ({
            id: ki.id,
            source: ki.source,
            content: ki.content,
            sourceUrl: ki.sourceUrl ?? null,
            owner: ki.owner ?? null,
            category: ki.category,
            sourceCreatedAt: ki.sourceCreatedAt ?? null,
          })),
          ...notionChunks.map((nc) => ({
            id: nc.pineconeId ?? nc.id,
            source: 'notion',
            content: nc.content,
            sourceUrl: null,
            owner: null,
            category: 'fact',
            sourceCreatedAt: nc.page?.lastEditedAt ?? null,
          })),
        ]

        // Sort chronologically — nulls last
        events.sort((a, b) => {
          if (!a.sourceCreatedAt && !b.sourceCreatedAt) return 0
          if (!a.sourceCreatedAt) return 1
          if (!b.sourceCreatedAt) return -1
          return a.sourceCreatedAt.getTime() - b.sourceCreatedAt.getTime()
        })

        const capped = events.slice(0, MAX_STORY_EVENTS)

        sendSSE(controller, { type: 'sources', events: capped })

        const context = capped
          .map((e) => {
            const ts = e.sourceCreatedAt ? e.sourceCreatedAt.toISOString() : 'unknown date'
            return `[${e.source.toUpperCase()} ${ts}] ${escapeXml(e.content.slice(0, 400))}`
          })
          .join('\n\n')

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                "You are a company historian. Given timestamped knowledge items from Slack, Notion, and Linear, reconstruct a clear chronological narrative answering the user's question. Be concise and factual. Cite sources inline as [slack], [notion], or [linear].",
            },
            {
              role: 'user',
              content: `Question: ${escapeXml(question)}\n\nSources:\n${context}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 800,
        })

        const answer = completion.choices[0]?.message?.content ?? 'Unable to generate story.'

        sendSSE(controller, { type: 'done', answer, events: capped })
      } catch (err) {
        console.error('[story] Error', err)
        sendSSE(controller, { type: 'error', message: 'Story generation failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
