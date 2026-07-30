import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { openai, generateEmbedding } from '@/lib/openai'
import { searchSimilar, searchInNamespace } from '@/lib/pinecone'
import { trackValidationEvent } from '@/lib/activity'
import { buildQuerySystemPrompt } from '@/lib/extraction/prompts'
import { splitRankedSources, type QuerySource } from '@/lib/query/source-ranking'
import { detectQueryIntent, type QueryIntent } from '@/lib/query/intent'
import { gmailThreadUrl } from '@/lib/gmail/api'
import { escapeXml } from '@/lib/utils'
import { createOrAppendConversation, storeAssistantMessage } from '@/lib/chat/persistence'
import { searchDocumentAttachments, type DocumentResult } from '@/lib/documents/search'
import { answerTtEldLocationQuestion, isTtEldLiveQuestion } from '@/lib/tteld/query'
import { validateApiKey } from '@/lib/api-auth'
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
  title: string | null
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
  verified: boolean
  conflictNote: string | null
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
    title: true,
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
    verified: true,
    conflictNote: true,
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
    source.source === 'linked_page' && typeof metadata.parentSource === 'string'
      ? `Linked from: ${metadata.parentSource}${typeof metadata.parentSourceExternalId === 'string' ? ` (${metadata.parentSourceExternalId})` : ''}`
      : null,
    source.source === 'linked_page' && source.sourceUrl ? `Linked page URL: ${source.sourceUrl}` : null,
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

function isTaskQuery(question: string) {
  return /\b(tasks?|to[- ]?dos?|action items?|asked me to do|follow[- ]?ups?)\b/i.test(question)
}

async function answerTaskQuery(workspaceId: string, question: string) {
  const lower = question.toLowerCase()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const source = ['telegram', 'slack', 'gmail', 'datatruck', 'linear', 'discord', 'notion'].find(value => lower.includes(value))
  const where: Prisma.TaskWhereInput = {
    workspaceId,
    status: { in: ['suggested', 'active'] },
    ...(source ? { sourceType: source } : {}),
    ...(/\burgent\b/.test(lower) ? { priority: 'urgent' } : {}),
    ...(/\btoday\b/.test(lower) ? { dueAt: { gte: today, lt: tomorrow } } : {}),
  }
  const tasks = await prisma.task.findMany({ where, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], take: 25 })
  if (!tasks.length) return 'I couldn’t find any tasks matching that request in your Tasks dashboard.'
  const lines = tasks.map((task, index) => {
    const due = task.dueAt ? ` — due ${task.dueAt.toLocaleString()}` : ''
    const sourceName = task.sourceType ? ` · ${sourceDisplayName(task.sourceType)}` : ''
    return `${index + 1}. **${task.title}**${due} · ${task.priority}${sourceName} · ${task.status}`
  })
  return `## Tasks\n\n${lines.join('\n')}\n\nBased on ${tasks.length} task${tasks.length === 1 ? '' : 's'} in your workspace.`
}

function summarizeSourceUpdates(sources: QuerySource[], intent: QueryIntent): string {
  const requested = intent.requestedSources[0] ?? sources[0]?.source ?? 'workspace'
  const display = sourceDisplayName(requested)
  const lines = [`## Recent ${display} updates`]
  const selected = sources.filter((source) => !intent.requestedSources.length || intent.requestedSources.includes(source.source)).slice(0, 8)
  if (selected.length === 0) {
    // Never present another integration's data as if it answered this question.
    // DataTruck and Five ELD are separate products; naming the mismatch out loud
    // is the difference between "no data" and a wrong answer.
    const otherSources = Array.from(new Set(
      sources.map((source) => source.source).filter(Boolean))) as string[]
    if (otherSources.length > 0) {
      const otherNames = otherSources.map(sourceDisplayName).join(', ')
      return `I don’t see recent ${display} updates in Neuron yet. I did find data from ${otherNames}, but that is separate from ${display}.`
    }
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

async function safeTrackEvent(...args: Parameters<typeof trackValidationEvent>) {
  try {
    return await trackValidationEvent(...args)
  } catch (err) {
    console.error('[query] validation event failed', { eventType: args[3], errorCode: err instanceof Error ? err.message : 'UNKNOWN' })
    return { ok: false as const, errorCode: 'ACTIVITY_WRITE_FAILED' as const }
  }
}

async function recordSuccessfulQuery(params: {
  workspaceId: string
  userId: string
  displayName: string
  queryLength: number
  sources: QuerySource[]
  resultCount: number
  hasAnswer: boolean
  confidence: number
  latencyMs: number
}) {
  const safeMetadata = {
    sourceTypes: [...new Set(params.sources.map((source) => source.source))],
    resultCount: params.resultCount,
    hasAnswer: params.hasAnswer,
    hasSources: params.sources.length > 0,
    latencyMs: params.latencyMs,
    confidence: params.confidence,
    queryLength: params.queryLength,
  }
  await safeTrackEvent(params.workspaceId, params.userId, params.displayName, 'query', `${params.displayName} queried the company brain`, safeMetadata)
  if (params.sources.length === 0 || !params.hasAnswer) return

  const answered = await safeTrackEvent(
    params.workspaceId,
    params.userId,
    params.displayName,
    'onboarding_question_answered',
    `${params.displayName} received a sourced answer`,
    { sourceTypes: safeMetadata.sourceTypes, sourceCount: params.sources.length },
  )
  if (!answered.ok) return
  try {
    const sourcedAnswers = await prisma.activityEvent.count({
      where: { workspaceId: params.workspaceId, eventType: 'onboarding_question_answered' },
    })
    if (sourcedAnswers < 3) return
    const existingCompletion = await prisma.activityEvent.findFirst({
      where: { workspaceId: params.workspaceId, eventType: 'onboarding_completed' },
      select: { id: true },
    })
    if (existingCompletion) return
    await prisma.user.updateMany({
      where: { clerkId: params.userId, workspace: { id: params.workspaceId } },
      data: { onboardingCompleted: true },
    })
    await safeTrackEvent(
      params.workspaceId,
      params.userId,
      params.displayName,
      'onboarding_completed',
      'Company brain setup completed',
      { sourcedAnswers },
    )
  } catch {
    // Onboarding progress is validation instrumentation and must never turn a
    // successful company-brain answer into a failed product request.
    console.error('[query] onboarding progress unavailable', { errorCode: 'ONBOARDING_PROGRESS_FAILED' })
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
  const startedAt = Date.now()
  let failureContext: { workspaceId: string; userId: string; displayName: string; queryLength: number } | null = null
  try {
    const apiWorkspaceId = validateApiKey(req)
    let userId: string
    let workspaceId: string

    if (apiWorkspaceId) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: apiWorkspaceId },
        select: { owner: { select: { clerkId: true } } },
      })
      if (!workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
      userId = workspace.owner.clerkId
      workspaceId = apiWorkspaceId
    } else {
      const session = await auth()
      if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = session.userId

      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { workspace: { select: { id: true } } },
      })
      if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
      workspaceId = user.workspace.id
    }

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
    failureContext = { workspaceId, userId, displayName, queryLength: question.length }
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

    if (isTaskQuery(question)) {
      const answer = await answerTaskQuery(workspaceId, question)
      const ranked = splitRankedSources([], 3, { query: question })
      void safeSaveQueryLog(workspaceId, userId, displayName, question, answer, [])
      if (conversationId) void storeAssistantMessage({ workspaceId, userId, conversationId, answer, sourceReferences: [], documentReferences: [], relatedLoadId, metadata: { confidence: 100, source: 'tasks' } }).catch(() => null)
      await recordSuccessfulQuery({ workspaceId, userId, displayName, queryLength: question.length, sources: [], resultCount: 0, hasAnswer: Boolean(answer.trim()), confidence: 100, latencyMs: Date.now() - startedAt })
      return new Response(makeStaticAnswerStream({ answer, ranked, documents: [], conversationId, confidence: 100 }), { headers: { 'Content-Type': 'text/event-stream' } })
    }

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
        await recordSuccessfulQuery({ workspaceId, userId, displayName, queryLength: question.length, sources: live.sources, resultCount: live.sources.length, hasAnswer: Boolean(live.answer.trim()), confidence: live.sources.length ? 100 : 0, latencyMs: Date.now() - startedAt })
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
      const noInfoAnswer = intent.requestedSources.includes('slack')
        ? "I don’t see synced Slack messages yet. Connect Slack Personal Access and choose channels to sync."
        : "I don't have verified information about this yet."
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
      await recordSuccessfulQuery({ workspaceId, userId, displayName, queryLength: question.length, sources: [], resultCount: 0, hasAnswer: true, confidence: 0, latencyMs: Date.now() - startedAt })
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
      pageTitle: item.source === 'linked_page'
        ? item.title ?? item.notionPageTitle ?? item.category
        : item.source === 'gmail'
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
      visibility: item.visibility,
      relevanceScore: scoreMap.get(item.id) ?? 0,
      verified: item.verified,
      conflictNote: item.conflictNote,
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
      await recordSuccessfulQuery({ workspaceId, userId, displayName, queryLength: question.length, sources: ranked.sources, resultCount: ranked.totalSources, hasAnswer: Boolean(answer.trim()), confidence, latencyMs: Date.now() - startedAt })
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
          const answer = fullAnswer.trim() || 'I could not find enough information to answer confidently, but these are the closest sources I found.'
          await recordSuccessfulQuery({ workspaceId, userId, displayName, queryLength: question.length, sources: ranked.sources, resultCount: ranked.totalSources, hasAnswer: Boolean(answer.trim()), confidence, latencyMs: Date.now() - startedAt })
          sendSSE(controller, { type: 'done', answer, ...ranked, documents: documentResults, conversationId, confidence, ...(retrievalDebug ? { retrievalDebug } : {}) })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } })
  } catch (err) {
    console.error('[query]', err instanceof Error ? err.message : 'unknown error')
    if (failureContext) {
      await safeTrackEvent(
        failureContext.workspaceId,
        failureContext.userId,
        failureContext.displayName,
        'query_failed',
        'Company brain query failed',
        { errorCode: 'QUERY_INTERNAL_ERROR', queryLength: failureContext.queryLength, latencyMs: Date.now() - startedAt },
      )
    }
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
