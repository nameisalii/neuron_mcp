import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { openai, generateEmbedding } from '@/lib/openai'
import { searchSimilar } from '@/lib/pinecone'
import { trackEvent } from '@/lib/activity'
import { buildQuerySystemPrompt } from '@/lib/extraction/prompts'
import type { LabeledByEntry } from '@/types'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

const QuerySchema = z.object({
  question: z.string().min(3).max(500),
})

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sendSSE(controller: ReadableStreamDefaultController, data: object) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

function makeEmptyStream(answer: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      sendSSE(controller, { type: 'done', answer, sources: [], confidence: 0 })
      controller.close()
    },
  })
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const { id: workspaceId } = user.workspace

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, displayName: true, department: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { displayName, department } = member

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = QuerySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Question must be 3–500 characters' }, { status: 400 })
    }

    const { question } = parsed.data
    const escapedQuestion = escapeXml(question)

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    })
    const workspaceName = workspace?.name ?? 'your workspace'

    const embedding = await generateEmbedding(question)

    const matches = await searchSimilar(embedding, workspaceId, 10, 0.3)

    const scoreMap = new Map<string, number>()
    for (const m of matches) {
      scoreMap.set(m.id, m.score)
    }

    const allPineconeIds = [...scoreMap.keys()]

    const chunkInclude = { page: { select: { id: true, title: true, notionPageId: true } } } as const

    let chunks = allPineconeIds.length > 0
      ? await prisma.notionChunk.findMany({
          where: { pineconeId: { in: allPineconeIds }, workspaceId },
          include: chunkInclude,
        })
      : []

    type KnowledgeItemResult = {
      id: string
      content: string
      source: string
      sourceUrl: string | null
      category: string
      label: string | null
    }
    let knowledgeItems: KnowledgeItemResult[] = []

    if (chunks.length === 0) {
      // Pinecone returned nothing — fall back to Postgres keyword search
      const keywords = question.trim().split(/\s+/).filter(w => w.length > 2)
      if (keywords.length > 0) {
        const keywordFilter = keywords.map(w => ({ content: { contains: w, mode: 'insensitive' as const } }))
        ;[chunks, knowledgeItems] = await Promise.all([
          prisma.notionChunk.findMany({
            where: { workspaceId, OR: keywordFilter },
            include: chunkInclude,
            take: 10,
            orderBy: { position: 'asc' },
          }),
          prisma.knowledgeItem.findMany({
            where: { workspaceId, OR: keywordFilter },
            select: { id: true, content: true, source: true, sourceUrl: true, category: true, label: true },
            take: 10,
          }),
        ])
      }
    }

    if (chunks.length === 0 && knowledgeItems.length === 0) {
      const noInfoAnswer = "I don't have verified information about this yet."
      void saveQueryLog(workspaceId, userId, displayName, question, noInfoAnswer, [])
      void trackEvent(workspaceId, userId, displayName, 'query', `[${displayName}] asked: ${question.slice(0, 80)}`, {})
      return new Response(makeEmptyStream(noInfoAnswer), { headers: { 'Content-Type': 'text/event-stream' } })
    }

    const chunkContext = chunks.map((chunk, i) => {
      const attribution = (chunk.labeledBy as unknown as LabeledByEntry[])
        .map((l) => `${l.displayName} as "${l.label}"`)
        .join(', ')
      const pageRef = `[Notion: ${chunk.page.title}]`
      const labelNote = attribution ? `\n   Labeled by: ${attribution}` : ''
      return `[${i + 1}] ${pageRef} ${chunk.content}${labelNote}`
    })

    const knowledgeContext = knowledgeItems.map((item, i) => {
      const sourceLabel = item.source.charAt(0).toUpperCase() + item.source.slice(1)
      const ref = `[${sourceLabel}: ${item.category}]`
      return `[${chunks.length + i + 1}] ${ref} ${item.content}`
    })

    const context = [...chunkContext, ...knowledgeContext].join('\n\n')

    const systemPrompt = buildQuerySystemPrompt({
      workspaceName,
      displayName,
      role: member.role,
      department: department ?? null,
    })

    const avgScore =
      chunks.length > 0
        ? chunks.reduce((sum, c) => sum + (scoreMap.get(c.pineconeId ?? '') ?? 0), 0) / chunks.length
        : 0
    const confidence = Math.round(avgScore * 100)

    const chunkSources = chunks.map((c) => ({
      chunkId: c.id,
      pageId: c.page.id,
      pageTitle: c.page.title,
      notionPageId: c.page.notionPageId,
      content: c.content.slice(0, 200),
      labels: c.labels,
    }))

    const knowledgeSources = knowledgeItems.map((item) => ({
      chunkId: item.id,
      pageId: null as string | null,
      pageTitle: item.category,
      notionPageId: null as string | null,
      content: item.content.slice(0, 200),
      labels: item.label ? [item.label] : [],
      source: item.source,
      sourceUrl: item.sourceUrl,
    }))

    const sources = [...chunkSources, ...knowledgeSources]

    const openaiStream = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `<question>${escapedQuestion}</question>\n\n<knowledge_items>\n${context}\n</knowledge_items>`,
        },
      ],
      temperature: 0.2,
    })

    const readable = new ReadableStream({
      async start(controller) {
        sendSSE(controller, { type: 'sources', sources, confidence })
        let fullAnswer = ''
        try {
          for await (const chunk of openaiStream as AsyncIterable<{ choices: Array<{ delta?: { content?: string }; finish_reason?: string | null }> }>) {
            const content = chunk.choices[0]?.delta?.content
            if (content) {
              fullAnswer += content
              sendSSE(controller, { type: 'delta', content })
            }
          }
          void saveQueryLog(workspaceId, userId, displayName, question, fullAnswer, [
            ...chunks.map((c) => c.id),
            ...knowledgeItems.map((k) => k.id),
          ])
          void trackEvent(workspaceId, userId, displayName, 'query', `[${displayName}] asked: ${question.slice(0, 80)}`, {})
          sendSSE(controller, { type: 'done', answer: fullAnswer, sources, confidence })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } })
  } catch (err) {
    console.error('[query]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function saveQueryLog(
  workspaceId: string,
  userId: string,
  displayName: string,
  query: string,
  answer: string,
  sourceChunkIds: string[],
) {
  await prisma.queryLog.create({
    data: {
      workspaceId,
      userId,
      displayName,
      query,
      answer,
      sourceChunkIds: sourceChunkIds as Prisma.InputJsonValue,
    },
  })
}
