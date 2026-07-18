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
import { detectQueryIntent, type QueryIntent } from '@/lib/query/intent'
import { gmailThreadUrl } from '@/lib/gmail/api'
import { escapeXml } from '@/lib/utils'
import { createOrAppendConversation, storeAssistantMessage } from '@/lib/chat/persistence'
import { searchDocumentAttachments, type DocumentResult } from '@/lib/documents/search'
import { answerTtEldLocationQuestion, isTtEldLiveQuestion } from '@/lib/tteld/query'
import {
  applyDocumentAssignment,
  attachedDocumentContext,
  loadWorkspaceDocuments,
  toDocumentResults,
} from '@/lib/documents/queryAttachments'

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

function makeStaticAnswerStream(params: {
  answer: string
  ranked: ReturnType<typeof splitRankedSources>
  documents: DocumentResult[]
  conversationId: string | null
  confidence: number
  retrievalDebug?: Record<string, unknown>
}): ReadableStream {
  return new ReadableStream({
    start(controller) {
      sendSSE(controller, {
        type: 'sources',
        ...params.ranked,
        documents: params.documents,
        conversationId: params.conversationId,
        confidence: params.confidence,
        ...(params.retrievalDebug ? { retrievalDebug: params.retrievalDebug } : {}),
      })
      sendSSE(controller, { type: 'delta', content: params.answer })
      sendSSE(controller, {
        type: 'done',
        answer: params.answer,
        ...params.ranked,
        documents: params.documents,
        conversationId: params.conversationId,
        confidence: params.confidence,
        ...(params.retrievalDebug ? { retrievalDebug: params.retrievalDebug } : {}),
      })
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

function metadataDateToIso(metadata: Record<string, unknown> | null, keys = ['messageDate', 'sentAt', 'createdAt', 'updatedAt']): string | null {
  if (!metadata) return null
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return null
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

async function findKnowledgeItems(
  where: Prisma.KnowledgeItemWhereInput,
  take?: number,
  orderBy?: Prisma.KnowledgeItemOrderByWithRelationInput | Prisma.KnowledgeItemOrderByWithRelationInput[],
): Promise<KnowledgeItemResult[]> {
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
      ...(orderBy ? { orderBy } : {}),
    }) as KnowledgeItemResult[]
  } catch (err) {
    if (!isMissingColumnError(err)) throw err
    console.error('[query] source metadata unavailable; continuing without source metadata')
    const rows = await prisma.knowledgeItem.findMany({
      where,
      select: baseSelect,
      ...(take ? { take } : {}),
      ...(orderBy ? { orderBy } : {}),
    })
    return rows.map((row) => ({ ...row, sourceMetadata: null }))
  }
}

function isMeaningfulText(value: string): boolean {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length >= 12 && !/^(fact|update|message|note)$/i.test(cleaned)
}

function visibilityWhere(workspaceId: string, userId: string): Prisma.KnowledgeItemWhereInput {
  return {
    workspaceId,
    OR: [
      { visibility: 'team' },
      { visibility: 'personal', visibilitySetBy: userId },
    ],
  }
}

function temporalWhere(intent: QueryIntent): Prisma.KnowledgeItemWhereInput | null {
  const { since, until, type } = intent.temporalIntent
  if (!since || type === 'latest') return null
  const range: Prisma.DateTimeFilter = { gte: since, ...(until ? { lt: until } : {}) }
  return {
    OR: [
      { sourceCreatedAt: range },
      { updatedAt: range },
    ],
  }
}

async function findIntentKnowledgeItems(params: {
  workspaceId: string
  userId: string
  intent: QueryIntent
}): Promise<KnowledgeItemResult[]> {
  if (params.intent.requestedSources.length === 0 && params.intent.temporalIntent.type === 'all_time') return []
  const base: Prisma.KnowledgeItemWhereInput = {
    ...visibilityWhere(params.workspaceId, params.userId),
    ...(params.intent.requestedSources.length > 0 ? { source: { in: params.intent.requestedSources } } : {}),
    ...(temporalWhere(params.intent) ?? {}),
  }
  let rows = await findKnowledgeItems(base, 20, [
    { sourceCreatedAt: 'desc' },
    { updatedAt: 'desc' },
  ])
  if (rows.length === 0 && params.intent.temporalIntent.type !== 'all_time') {
    rows = await findKnowledgeItems({
      ...visibilityWhere(params.workspaceId, params.userId),
      ...(params.intent.requestedSources.length > 0 ? { source: { in: params.intent.requestedSources } } : {}),
    }, 20, [
      { sourceCreatedAt: 'desc' },
      { updatedAt: 'desc' },
    ])
  }
  return rows.filter((item) => isMeaningfulText(item.content))
}

function formatSourceForModel(source: QuerySource, index: number): string {
  const sourceLabel = source.source.charAt(0).toUpperCase() + source.source.slice(1)
  const metadata = source.sourceMetadata ?? {}
  const title = source.pageTitle && source.pageTitle !== 'fact' ? source.pageTitle : null
  const date = source.sourceCreatedAt ?? source.updatedAt
  const meta = [
    title ? `Title: ${title}` : null,
    source.owner ? `Author/owner: ${source.owner}` : null,
    date ? `Date: ${date}` : null,
    typeof metadata.channelName === 'string' ? `Channel: ${metadata.channelName}` : null,
    typeof metadata.loadNumber === 'string' ? `Load: ${metadata.loadNumber}` : null,
  ].filter(Boolean).join(' · ')
  return `[${index + 1}] [${sourceLabel}]${meta ? ` ${meta}` : ''}\n${source.content}`
}

function sourceDisplayName(source: string): string {
  if (source === 'five_eld') return 'Five ELD'
  if (source === 'gmail') return 'Gmail'
  if (source === 'datatruck') return 'Datatruck'
  if (source === 'teams') return 'Microsoft Teams'
  return source.charAt(0).toUpperCase() + source.slice(1)
}

function summarizeSourceUpdates(sources: QuerySource[], intent: QueryIntent): string {
  const requested = intent.requestedSources[0] ?? sources[0]?.source ?? 'workspace'
  const display = sourceDisplayName(requested)
  const lines = [`## Recent ${display} updates`]
  const selected = sources.filter((source) => !intent.requestedSources.length || intent.requestedSources.includes(source.source)).slice(0, 8)
  if (selected.length === 0) {
    return `I couldn’t find ${display} updates matching that request in your connected workspace.`
  }
  selected.forEach((source, index) => {
    const metadata = source.sourceMetadata ?? {}
    const title = source.pageTitle && source.pageTitle !== 'fact'
      ? source.pageTitle
      : typeof metadata.channelName === 'string'
        ? metadata.channelName
        : `${display} item ${index + 1}`
    const date = source.sourceCreatedAt ?? source.updatedAt
    const text = source.content.replace(/\s+/g, ' ').trim()
    const summary = text.length > 240 ? `${text.slice(0, 237)}...` : text
    lines.push(`\n${index + 1}. **${title}**${date ? ` — ${new Date(date).toLocaleString()}` : ''}\n${summary}`)
  })
  const dates = selected
    .map((source) => source.sourceCreatedAt ?? source.updatedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())
  const dateSummary = dates.length
    ? ` from ${dates[0].toLocaleDateString()}${dates.length > 1 ? `–${dates[dates.length - 1].toLocaleDateString()}` : ''}`
    : ''
  lines.push(`\nBased on ${selected.length} ${display} source${selected.length === 1 ? '' : 's'}${dateSummary}.`)
  if (intent.temporalIntent.type === 'today' && dates.length > 0) {
    const today = new Date().toDateString()
    const hasToday = dates.some((date) => date.toDateString() === today)
    if (!hasToday) lines.push(`\nI couldn’t find ${display} updates from today. These are the most recent available items in Neuron.`)
  }
  return lines.join('\n')
}

function retrievalDebugPayload(params: {
  query: string
  intent: QueryIntent
  sources: QuerySource[]
  passedToModelCount: number
}) {
  if (process.env.DEBUG_QUERY_RETRIEVAL !== 'true') return undefined
  return {
    query: params.query,
    requestedSources: params.intent.requestedSources,
    temporalIntent: params.intent.temporalIntent.type,
    retrievedCount: params.sources.length,
    passedToModelCount: params.passedToModelCount,
    sourceTypes: [...new Set(params.sources.map((source) => source.source))],
    sourceIds: params.sources.map((source) => source.chunkId),
    sourceDates: params.sources.map((source) => source.sourceCreatedAt ?? source.updatedAt).filter(Boolean),
  }
}

function intentMetadata(intent: QueryIntent): Prisma.InputJsonObject {
  return {
    requestedSources: intent.requestedSources,
    temporalIntent: {
      type: intent.temporalIntent.type,
      since: intent.temporalIntent.since?.toISOString() ?? null,
      until: intent.temporalIntent.until?.toISOString() ?? null,
    },
    queryType: intent.queryType,
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
    const intent = detectQueryIntent(question)
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

    if (isTtEldLiveQuestion(question)) {
      const live = await answerTtEldLocationQuestion(workspaceId, question)
      if (live) {
        const ranked = splitRankedSources(live.sources, 3, { requestedSources: ['five_eld'], query: question })
        void safeSaveQueryLog(workspaceId, userId, displayName, question, live.answer, live.sources.map((source) => source.chunkId))
        if (conversationId) {
          void storeAssistantMessage({
            workspaceId,
            userId,
            conversationId,
            answer: live.answer,
            sourceReferences: live.sources as unknown as Prisma.InputJsonValue,
            documentReferences: [],
            relatedLoadId,
            metadata: { confidence: live.sources.length ? 100 : 0, liveSource: 'five_eld' },
          }).catch(() => null)
        }
        void safeTrackEvent(workspaceId, userId, displayName, 'query', `[${displayName}] asked a live Five ELD question`, { conversationId, integration: 'five_eld' })
        return new Response(makeStaticAnswerStream({ answer: live.answer, ranked, documents: [], conversationId, confidence: live.sources.length ? 100 : 0 }), {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
    }

    const embedding = await generateEmbedding(question)
    const personalNamespace = `${workspaceId}:${userId}`

    const [teamMatches, personalMatches] = await Promise.all([
      searchSimilar(embedding, workspaceId, intent.requestedSources.length > 0 ? 20 : 10, 0.3),
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
              ...visibilityWhere(workspaceId, userId),
              id: { in: allPineconeIds },
          }),
        ])
      : [[], []]

    knowledgeItems = knowledgeItems as KnowledgeItemResult[]

    const intentKnowledgeItems = await findIntentKnowledgeItems({ workspaceId, userId, intent })
    if (intentKnowledgeItems.length > 0) {
      const byId = new Map(knowledgeItems.map((item) => [item.id, item]))
      for (const item of intentKnowledgeItems) {
        if (!byId.has(item.id)) {
          knowledgeItems.push(item)
          scoreMap.set(item.id, Math.max(scoreMap.get(item.id) ?? 0, 0.7))
        } else {
          scoreMap.set(item.id, Math.max(scoreMap.get(item.id) ?? 0, 0.7))
        }
      }
    }

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
              ...visibilityWhere(workspaceId, userId),
              AND: [
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

    const knowledgeSources: QuerySource[] = knowledgeItems.map((item) => {
      const sourceMetadata = item.sourceMetadata && typeof item.sourceMetadata === 'object' && !Array.isArray(item.sourceMetadata)
        ? item.sourceMetadata as Record<string, unknown>
        : null
      return {
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
      sourceMetadata,
      sourceCreatedAt: item.source === 'gmail'
        ? dateToIso(item.sourceExternalId ? gmailThreadMap.get(item.sourceExternalId)?.lastMessageAt ?? null : null)
          ?? item.sourceCreatedAt?.toISOString()
          ?? metadataDateToIso(sourceMetadata)
          ?? null
        : item.sourceCreatedAt?.toISOString() ?? metadataDateToIso(sourceMetadata) ?? null,
      updatedAt: item.updatedAt?.toISOString() ?? null,
      relevanceScore: scoreMap.get(item.id) ?? 0,
    }})

    const ranked = splitRankedSources([...chunkSources, ...knowledgeSources], 3, {
      requestedSources: intent.requestedSources,
      temporalType: intent.temporalIntent.type,
      query: question,
    })
    const answerContextSources = ranked.sources.slice(0, intent.queryType === 'summary' ? 12 : 8)
    const context = [
      attachedDocumentContext(attachedDocuments),
      ...answerContextSources.map((source, index) => formatSourceForModel(source, index)),
      documentContext(documentResults),
    ].filter(Boolean).join('\n\n')
    const retrievalDebug = retrievalDebugPayload({
      query: question,
      intent,
      sources: ranked.sources,
      passedToModelCount: answerContextSources.length,
    })

    if (process.env.DEBUG_QUERY_RETRIEVAL === 'true') {
      console.info('[query/retrieval]', retrievalDebug ?? null)
    }

    if (intent.queryType === 'summary' && intent.requestedSources.length > 0 && answerContextSources.length > 0) {
      const answer = summarizeSourceUpdates(answerContextSources, intent)
      void safeSaveQueryLog(workspaceId, userId, displayName, question, answer, answerContextSources.map((source) => source.chunkId))
      if (conversationId) {
        void storeAssistantMessage({
          workspaceId,
          userId,
          conversationId,
          answer,
          sourceReferences: ranked.sources as unknown as Prisma.InputJsonValue,
          documentReferences: documentResults as unknown as Prisma.InputJsonValue,
          relatedLoadId,
          metadata: {
            confidence,
            totalSources: ranked.totalSources,
            documentCount: documentResults.length,
            queryIntent: intentMetadata(intent),
            ...(documentIds.length > 0 ? { uploadedDocumentIds: documentIds } : {}),
          },
        }).catch((err) => console.error('[query] assistant persistence failed', err))
      }
      void safeTrackEvent(workspaceId, userId, displayName, 'query', `[${displayName}] asked: ${question.slice(0, 80)}`, {
        conversationId,
        relatedLoadId,
        documentCount: documentResults.length,
      })
      return new Response(makeStaticAnswerStream({ answer, ranked, documents: documentResults, conversationId, confidence, retrievalDebug }), {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    const openaiStream = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `<question>${escapedQuestion}</question>\n\n<intent>${escapeXml(JSON.stringify({
            requestedSources: intent.requestedSources,
            temporalIntent: intent.temporalIntent.type,
            queryType: intent.queryType,
          }))}</intent>\n\n<answer_rules>
Use the provided workspace knowledge. If sources are present, summarize or explain those sources; do not claim there is no information unless the provided sources are genuinely irrelevant. Do not recommend public official channels for workspace questions.
</answer_rules>\n\n<knowledge_items>\n${context}\n</knowledge_items>`,
        },
      ],
      temperature: 0.2,
    })

    const readable = new ReadableStream({
      async start(controller) {
        sendSSE(controller, { type: 'sources', ...ranked, documents: documentResults, conversationId, confidence, ...(retrievalDebug ? { retrievalDebug } : {}) })
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
          sendSSE(controller, { type: 'done', answer, ...ranked, documents: documentResults, conversationId, confidence, ...(retrievalDebug ? { retrievalDebug } : {}) })
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
