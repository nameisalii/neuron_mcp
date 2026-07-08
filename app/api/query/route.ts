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
import { createOrAppendConversation, storeAssistantMessage } from '@/lib/chat/persistence'
import { searchDocumentAttachments, type DocumentResult } from '@/lib/documents/search'
import {
  applyDocumentAssignment,
  attachedDocumentContext,
  loadWorkspaceDocuments,
  toDocumentResults,
} from '@/lib/documents/queryAttachments'
import type { LabeledByEntry } from '@/types'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

const QuerySchema = z.object({
  question: z.string().optional(),
  query: z.string().optional(),
  conversationId: z.string().trim().min(1).nullable().optional(),
  documentIds: z.array(z.string().trim().min(1)).max(5).optional(),
}).transform((data) => ({
  question: (data.question ?? data.query ?? '').trim(),
  conversationId: data.conversationId ?? undefined,
  documentIds: data.documentIds ?? [],
})).refine((data) => data.question.length >= 3 && data.question.length <= 500, {
  message: 'Question must be 3-500 characters',
  path: ['question'],
})

function sendSSE(controller: ReadableStreamDefaultController, data: object) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

function makeEmptyStream(answer: string, conversationId: string | null, confidence = 0): ReadableStream {
  return new ReadableStream({
    start(controller) {
      sendSSE(controller, { type: 'sources', sources: [], topSources: [], remainingSources: [], totalSources: 0, documents: [], conversationId, confidence })
      sendSSE(controller, { type: 'done', answer, sources: [], topSources: [], remainingSources: [], totalSources: 0, documents: [], conversationId, confidence })
      controller.close()
    },
  })
}

function documentContext(documents: DocumentResult[]): string {
  if (documents.length === 0) return ''
  return documents.map((document, i) => {
    const parts = [
      `File: ${document.fileName}`,
      document.documentType ? `Type: ${document.documentType}` : null,
      document.externalLoadId ? `Load: ${document.externalLoadId}` : null,
      `Source: ${document.source}`,
      document.sourceUrl ? `Source URL: ${document.sourceUrl}` : null,
      document.storageUrl ? `Download URL: ${document.storageUrl}` : null,
      document.snippet ? `Snippet: ${document.snippet}` : null,
    ].filter(Boolean).join(' · ')
    return `[Document ${i + 1}] ${parts}`
  }).join('\n')
}

function dateToIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

type KnowledgeItemResult = {
  id: string
  content: string
  source: string
  sourceUrl: string | null
  sourceExternalId: string | null
  category: string
  label: string | null
  owner: string | null
  sourceMetadata: Prisma.JsonValue | null
  notionPageTitle: string | null
  sourceCreatedAt: Date | null
  updatedAt: Date
  visibility: string
  visibilitySetBy: string | null
}

function isMissingColumnError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('column') && message.includes('does not exist')
}

async function findKnowledgeItems(where: Prisma.KnowledgeItemWhereInput, take?: number): Promise<KnowledgeItemResult[]> {
  const baseSelect = {
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
  } satisfies Prisma.KnowledgeItemSelect

  try {
    return await prisma.knowledgeItem.findMany({
      where,
      select: { ...baseSelect, sourceMetadata: true },
      ...(take ? { take } : {}),
    }) as KnowledgeItemResult[]
  } catch (err) {
    if (!isMissingColumnError(err)) throw err
    console.error('[query] source metadata unavailable; continuing without source metadata')
    const rows = await prisma.knowledgeItem.findMany({
      where,
      select: baseSelect,
      ...(take ? { take } : {}),
    })
    return rows.map((row) => ({ ...row, sourceMetadata: null }))
  }
}

async function safeTrackEvent(...args: Parameters<typeof trackEvent>) {
  try {
    await trackEvent(...args)
  } catch (err) {
    console.error('[query] activity tracking skipped', err instanceof Error ? err.message : 'unknown error')
  }
}

async function safeSaveQueryLog(
  workspaceId: string,
  userId: string,
  displayName: string,
  query: string,
  answer: string,
  sourceChunkIds: string[],
) {
  try {
    await saveQueryLog(workspaceId, userId, displayName, query, answer, sourceChunkIds)
  } catch (err) {
    console.error('[query] query log skipped', err instanceof Error ? err.message : 'unknown error')
  }
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

    const { question, conversationId: requestedConversationId, documentIds } = parsed.data
    const escapedQuestion = escapeXml(question)
    let conversationId: string | null = null
    let relatedLoadId: string | null = null

    // Documents explicitly attached to this question — must belong to this workspace.
    let attachedDocuments = await loadWorkspaceDocuments(workspaceId, documentIds)
    if (attachedDocuments === null) {
      return NextResponse.json({ error: 'Document not found in this workspace' }, { status: 403 })
    }
    if (attachedDocuments.length > 0) {
      attachedDocuments = await applyDocumentAssignment(workspaceId, question, attachedDocuments)
    }

    try {
      const conversation = await createOrAppendConversation({
        workspaceId,
        userId,
        question,
        conversationId: requestedConversationId,
      })
      conversationId = conversation.conversationId
      relatedLoadId = conversation.relatedLoadId
    } catch (err) {
      console.error('[query] chat persistence failed', err)
    }

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

    let documentResults: DocumentResult[] = []
    try {
      documentResults = await searchDocumentAttachments(workspaceId, question)
    } catch (err) {
      console.error('[query] document search failed', err instanceof Error ? err.message : 'unknown error')
    }
    // Attached documents lead the Resources list; drop duplicate search hits.
    if (attachedDocuments.length > 0) {
      const attachedIds = new Set(attachedDocuments.map((document) => document.id))
      documentResults = [
        ...toDocumentResults(attachedDocuments),
        ...documentResults.filter((document) => !attachedIds.has(document.id)),
      ]
    }

    let [chunks, knowledgeItems] = allPineconeIds.length > 0
      ? await Promise.all([
        prisma.notionChunk.findMany({
          where: { pineconeId: { in: allPineconeIds }, workspaceId },
          include: chunkInclude,
        }),
          findKnowledgeItems({
              workspaceId,
              id: { in: allPineconeIds },
              OR: [
                { visibility: 'team' },
                { visibility: 'personal', visibilitySetBy: userId },
              ],
          }),
        ])
      : [[], []]

    knowledgeItems = knowledgeItems as KnowledgeItemResult[]

    if (chunks.length === 0 && knowledgeItems.length === 0 && documentResults.length === 0) {
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
          findKnowledgeItems({
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
            }, 10),
        ])
      }
    }

    if (chunks.length === 0 && knowledgeItems.length === 0 && documentResults.length === 0) {
      const noInfoAnswer = "I don't have verified information about this yet."
      if (conversationId) {
        void storeAssistantMessage({
          workspaceId,
          userId,
          conversationId,
          answer: noInfoAnswer,
          sourceReferences: [],
          documentReferences: [],
          relatedLoadId,
          metadata: { confidence: 0, totalSources: 0, documentCount: 0 },
        }).catch((err) => console.error('[query] assistant persistence failed', err))
      }
      void safeSaveQueryLog(workspaceId, userId, displayName, question, noInfoAnswer, [])
      void safeTrackEvent(workspaceId, userId, displayName, 'query', `[${displayName}] asked: ${question.slice(0, 80)}`, conversationId ? { conversationId, relatedLoadId } : {})
      return new Response(makeEmptyStream(noInfoAnswer, conversationId), { headers: { 'Content-Type': 'text/event-stream' } })
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

    const context = [
      attachedDocumentContext(attachedDocuments),
      ...chunkContext,
      ...knowledgeContext,
      documentContext(documentResults),
    ].filter(Boolean).join('\n\n')

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
      sourceMetadata: null,
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
      sourceMetadata: item.sourceMetadata && typeof item.sourceMetadata === 'object' && !Array.isArray(item.sourceMetadata)
        ? item.sourceMetadata as Record<string, unknown>
        : null,
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
        sendSSE(controller, { type: 'sources', ...ranked, documents: documentResults, conversationId, confidence })
        let fullAnswer = ''
        try {
          for await (const chunk of openaiStream as AsyncIterable<{ choices: Array<{ delta?: { content?: string }; finish_reason?: string | null }> }>) {
            const content = chunk.choices[0]?.delta?.content
            if (content) {
              fullAnswer += content
              sendSSE(controller, { type: 'delta', content })
            }
          }
          void safeSaveQueryLog(workspaceId, userId, displayName, question, fullAnswer, [
            ...chunks.map((c) => c.id),
            ...knowledgeItems.map((k) => k.id),
          ])
          if (conversationId) {
            void storeAssistantMessage({
              workspaceId,
              userId,
              conversationId,
              answer: fullAnswer,
              sourceReferences: ranked.sources as unknown as Prisma.InputJsonValue,
              documentReferences: documentResults as unknown as Prisma.InputJsonValue,
              relatedLoadId,
              metadata: {
                confidence,
                totalSources: ranked.totalSources,
                documentCount: documentResults.length,
                ...(documentIds.length > 0 ? { uploadedDocumentIds: documentIds } : {}),
              },
            }).catch((err) => console.error('[query] assistant persistence failed', err))
          }
          void safeTrackEvent(workspaceId, userId, displayName, 'query', `[${displayName}] asked: ${question.slice(0, 80)}`, {
            conversationId,
            relatedLoadId,
            documentCount: documentResults.length,
          })
          const answer = fullAnswer.trim() || 'I could not find enough information to answer confidently, but these are the closest sources I found.'
          sendSSE(controller, { type: 'done', answer, ...ranked, documents: documentResults, conversationId, confidence })
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
