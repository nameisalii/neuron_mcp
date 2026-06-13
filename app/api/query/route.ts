import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { openai, generateEmbedding } from '@/lib/openai'
import { searchSimilar, searchInNamespace } from '@/lib/pinecone'
import { trackEvent } from '@/lib/activity'
import { buildQuerySystemPrompt } from '@/lib/extraction/prompts'
import { splitRankedSources, type QuerySource } from '@/lib/query/source-ranking'
import { gmailThreadUrl } from '@/lib/gmail/api'
import { escapeXml } from '@/lib/utils'
import type { LabeledByEntry } from '@/types'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

const QuerySchema = z.object({
  question: z.string().min(3).max(500),
})

function sendSSE(controller: ReadableStreamDefaultController, data: object) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

function makeEmptyStream(answer: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      sendSSE(controller, { type: 'done', answer, sources: [], topSources: [], remainingSources: [], totalSources: 0, confidence: 0 })
      controller.close()
    },
  })
}

function dateToIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
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
    const personalNamespace = `${workspaceId}:${userId}`

    const [teamMatches, personalMatches] = await Promise.all([
      searchSimilar(embedding, workspaceId, 10, 0.3),
      searchInNamespace(embedding, personalNamespace, 25, 0.3),
    ])

    const scoreMap = new Map<string, number>()
    for (const m of [...teamMatches, ...personalMatches]) {
      scoreMap.set(m.id, Math.max(scoreMap.get(m.id) ?? 0, m.score))
    }

    const allPineconeIds = [...scoreMap.keys()]

    const chunkInclude = { page: { select: { id: true, title: true, notionPageId: true, lastEditedAt: true } } } as const

    let [chunks, knowledgeItems] = allPineconeIds.length > 0
      ? await Promise.all([
        prisma.notionChunk.findMany({
          where: { pineconeId: { in: allPineconeIds }, workspaceId },
          include: chunkInclude,
        }),
          prisma.knowledgeItem.findMany({
            where: {
              workspaceId,
              id: { in: allPineconeIds },
              OR: [
                { visibility: 'team' },
                { visibility: 'personal', visibilitySetBy: userId },
              ],
            },
            select: {
              id: true,
              content: true,
              source: true,
              sourceUrl: true,
              sourceExternalId: true,
              category: true,
              label: true,
              owner: true,
              notionPageTitle: true,
              sourceCreatedAt: true,
              updatedAt: true,
              visibility: true,
              visibilitySetBy: true,
            },
          }),
        ])
      : [[], []]

    type KnowledgeItemResult = {
      id: string
      content: string
      source: string
      sourceUrl: string | null
      sourceExternalId: string | null
      category: string
      label: string | null
      owner: string | null
      notionPageTitle: string | null
      sourceCreatedAt: Date | null
      updatedAt: Date
      visibility: string
      visibilitySetBy: string | null
    }
    knowledgeItems = knowledgeItems as KnowledgeItemResult[]

    if (chunks.length === 0 && knowledgeItems.length === 0) {
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
            where: {
              workspaceId,
              AND: [
                {
                  OR: [
                    { visibility: 'team' },
                    { visibility: 'personal', visibilitySetBy: userId },
                  ],
                },
                { OR: keywordFilter },
              ],
            },
            select: {
              id: true,
              content: true,
              source: true,
              sourceUrl: true,
              sourceExternalId: true,
              category: true,
              label: true,
              owner: true,
              notionPageTitle: true,
              sourceCreatedAt: true,
              updatedAt: true,
              visibility: true,
              visibilitySetBy: true,
            },
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

    const gmailThreadIds = [...new Set(knowledgeItems.filter((item) => item.source === 'gmail' && item.sourceExternalId).map((item) => item.sourceExternalId!))]
    const gmailThreads = gmailThreadIds.length > 0
      ? await prisma.emailThread.findMany({
          where: { workspaceId, gmailThreadId: { in: gmailThreadIds } },
          select: {
            gmailThreadId: true,
            subject: true,
            labelNames: true,
            lastMessageAt: true,
            chunks: {
              take: 1,
              orderBy: { position: 'asc' },
              select: { metadata: true },
            },
          },
        })
      : []
    const gmailThreadMap = new Map(gmailThreads.map((thread) => {
      const firstChunkMeta = (thread.chunks[0]?.metadata as Record<string, unknown> | null) ?? {}
      const sender = typeof firstChunkMeta.from === 'string' ? firstChunkMeta.from : null
      const url = typeof firstChunkMeta.url === 'string' ? firstChunkMeta.url : gmailThreadUrl(thread.gmailThreadId)
      return [thread.gmailThreadId, {
        subject: thread.subject,
        labelNames: thread.labelNames ?? [],
        lastMessageAt: thread.lastMessageAt,
        sender,
        url,
      }] as const
    }))

    const knowledgeContext = knowledgeItems.map((item, i) => {
      if (item.source === 'gmail') {
        const gmail = item.sourceExternalId ? gmailThreadMap.get(item.sourceExternalId) : null
        const meta = [
          gmail?.subject ? `Subject: ${gmail.subject}` : null,
          gmail?.sender ? `Sender: ${gmail.sender}` : null,
          gmail?.labelNames?.length ? `Labels: ${gmail.labelNames.join(', ')}` : null,
          gmail?.lastMessageAt ? `Date: ${gmail.lastMessageAt.toISOString()}` : null,
        ].filter(Boolean).join(' · ')
        const ref = `[Gmail: ${gmail?.subject ?? item.notionPageTitle ?? item.sourceExternalId ?? 'Email'}]`
        return `[${chunks.length + i + 1}] ${ref} ${meta}\n${item.content}`
      }
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

    const matchedScores = [...chunks.map((c) => scoreMap.get(c.pineconeId ?? '') ?? 0), ...knowledgeItems.map((item) => scoreMap.get(item.id) ?? 0)]
    const avgScore = matchedScores.length > 0 ? matchedScores.reduce((sum, score) => sum + score, 0) / matchedScores.length : 0
    const confidence = Math.round(avgScore * 100)

    const chunkSources: QuerySource[] = chunks.map((c) => ({
      chunkId: c.id,
      pageId: c.page.id,
      pageTitle: c.page.title,
      notionPageId: c.page.notionPageId,
      content: c.content,
      labels: Array.isArray(c.labels) ? c.labels.filter((label): label is string => typeof label === 'string') : [],
      source: 'notion',
      sourceUrl: null,
      sourceExternalId: c.page.notionPageId,
      owner: null,
      sourceCreatedAt: c.page.lastEditedAt?.toISOString() ?? null,
      updatedAt: c.updatedAt?.toISOString() ?? null,
      relevanceScore: scoreMap.get(c.pineconeId ?? '') ?? 0,
    }))

    const knowledgeSources: QuerySource[] = knowledgeItems.map((item) => ({
      chunkId: item.id,
      pageId: null,
      pageTitle: item.source === 'gmail'
        ? (item.sourceExternalId ? gmailThreadMap.get(item.sourceExternalId)?.subject : null) ?? item.notionPageTitle ?? item.category
        : item.notionPageTitle ?? item.category,
      notionPageId: null,
      content: item.content,
      labels: [
        ...new Set([
          item.category,
          item.label,
          ...(item.source === 'gmail' && item.sourceExternalId ? gmailThreadMap.get(item.sourceExternalId)?.labelNames ?? [] : []),
        ].filter((label): label is string => Boolean(label))),
      ],
      source: item.source,
      sourceUrl: item.source === 'gmail'
        ? (item.sourceExternalId ? gmailThreadMap.get(item.sourceExternalId)?.url : null) ?? item.sourceUrl ?? null
        : item.sourceUrl ?? null,
      sourceExternalId: item.sourceExternalId ?? null,
      owner: item.source === 'gmail'
        ? (item.sourceExternalId ? gmailThreadMap.get(item.sourceExternalId)?.sender : null) ?? item.owner ?? null
        : item.owner ?? null,
      sourceCreatedAt: item.source === 'gmail'
        ? dateToIso(item.sourceExternalId ? gmailThreadMap.get(item.sourceExternalId)?.lastMessageAt ?? null : null)
          ?? item.sourceCreatedAt?.toISOString()
          ?? null
        : item.sourceCreatedAt?.toISOString() ?? null,
      updatedAt: item.updatedAt?.toISOString() ?? null,
      relevanceScore: scoreMap.get(item.id) ?? 0,
    }))

    const ranked = splitRankedSources([...chunkSources, ...knowledgeSources])

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
        sendSSE(controller, { type: 'sources', ...ranked, confidence })
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
          const answer = fullAnswer.trim() || 'I could not find enough information to answer confidently, but these are the closest sources I found.'
          sendSSE(controller, { type: 'done', answer, ...ranked, confidence })
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
