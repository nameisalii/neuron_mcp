import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
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
import { createOrAppendConversation, loadRecentConversationMessages, storeAssistantMessage } from '@/lib/chat/persistence'
import { rewriteQuery, type QueryRewriteResult } from '@/lib/query/rewrite'
import { planQueryAnswer } from '@/lib/query/answer-plan'
import { buildDetailedInterviewAnswer } from '@/lib/query/interview-details'
import { searchDocumentAttachments, type DocumentResult } from '@/lib/documents/search'
import { answerTtEldLocationQuestion, isTtEldLiveQuestion } from '@/lib/tteld/query'
import { validateApiKey } from '@/lib/api-auth'
import { telegramModeCapabilityAnswer } from '@/lib/telegram/product'
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

function interpretationPayload(rewrite: QueryRewriteResult) {
  return process.env.QUERY_DEBUG_INTERPRETATION === 'true'
    ? { interpretation: rewrite.rewrittenQuery }
    : {}
}

function makeEmptyStream(answer: string, conversationId: string | null, confidence = 0, rewrite?: QueryRewriteResult): ReadableStream {
  return new ReadableStream({
    start(controller) {
      sendSSE(controller, { type: 'sources', sources: [], topSources: [], remainingSources: [], totalSources: 0, documents: [], conversationId, confidence, ...(rewrite ? interpretationPayload(rewrite) : {}) })
      sendSSE(controller, { type: 'done', answer, sources: [], topSources: [], remainingSources: [], totalSources: 0, documents: [], conversationId, confidence, ...(rewrite ? interpretationPayload(rewrite) : {}) })
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
  rewrite?: QueryRewriteResult
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
        ...(params.rewrite ? interpretationPayload(params.rewrite) : {}),
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
        ...(params.rewrite ? interpretationPayload(params.rewrite) : {}),
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
  summary: string | null
  reason: string | null
  alternatives: string | null
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
    summary: true,
    reason: true,
    alternatives: true,
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

function safeMetadata(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function findGmailChunkSources(params: {
  workspaceId: string
  userId: string
  pineconeIds: string[]
  terms: string[]
}): Promise<QuerySource[]> {
  const terms = params.terms.map((term) => term.trim()).filter((term) => term.length >= 2)
  if (params.pineconeIds.length === 0 && terms.length === 0) return []
  const rows = await prisma.emailChunk.findMany({
    where: {
      workspaceId: params.workspaceId,
      visibility: 'personal',
      visibilitySetBy: params.userId,
      OR: [
        ...(params.pineconeIds.length ? [{ pineconeId: { in: params.pineconeIds } }] : []),
        ...terms.flatMap((term) => [
          { content: { contains: term, mode: 'insensitive' as const } },
          { thread: { subject: { contains: term, mode: 'insensitive' as const } } },
        ]),
      ],
    },
    include: { thread: { select: { id: true, gmailThreadId: true, subject: true, labelNames: true, lastMessageAt: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 40,
  })
  return rows.map((row) => {
    const metadata = safeMetadata(row.metadata)
    const sender = typeof metadata.from === 'string' ? metadata.from : null
    const date = metadataDateToIso(metadata, ['date', 'messageDate', 'sourceCreatedAt']) ?? row.thread.lastMessageAt.toISOString()
    return {
      chunkId: row.id,
      pageId: row.thread.id,
      pageTitle: row.thread.subject || 'Gmail message',
      notionPageId: null,
      content: row.content,
      labels: ['gmail', ...row.thread.labelNames],
      source: 'gmail',
      sourceUrl: typeof metadata.url === 'string' ? metadata.url : gmailThreadUrl(row.thread.gmailThreadId),
      sourceExternalId: typeof metadata.messageId === 'string' ? metadata.messageId : row.thread.gmailThreadId,
      owner: sender,
      sourceMetadata: {
        subject: row.thread.subject,
        from: sender,
        date,
        labelNames: row.thread.labelNames,
        snippet: row.content.replace(/\s+/g, ' ').trim().slice(0, 280),
        threadId: row.thread.gmailThreadId,
      },
      sourceCreatedAt: date,
      updatedAt: row.updatedAt.toISOString(),
      visibility: row.visibility,
      relevanceScore: params.pineconeIds.includes(row.pineconeId ?? '') ? 0.9 : 0.82,
      verified: true,
    }
  })
}

function sourceDisplayName(source: string): string {
  if (source === 'five_eld') return 'Five ELD'
  if (source === 'gmail') return 'Gmail'
  if (source === 'datatruck') return 'Datatruck'
  if (source === 'teams') return 'Microsoft Teams'
  return source.charAt(0).toUpperCase() + source.slice(1)
}

function sourceMatchesEntity(source: QuerySource, terms: string[]): boolean {
  if (terms.length === 0) return true
  const haystack = `${source.pageTitle} ${source.content} ${source.owner ?? ''} ${source.sourceExternalId ?? ''}`.toLowerCase()
  return terms.some((term) => {
    const normalized = term.toLowerCase()
    if (normalized.length <= 3) return new RegExp(`(^|\\W)${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\W)`, 'i').test(haystack)
    return haystack.includes(normalized)
  })
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

async function findStructuredQuerySources(params: {
  workspaceId: string
  entityTerms: string[]
  includeRecruiting: boolean
}): Promise<QuerySource[]> {
  const entityTerms = params.entityTerms.filter((term) => term.length >= 2)
  const recruitingTerms = params.includeRecruiting
    ? ['interview', 'recruiter', 'recruiting', 'OA', 'onsite', 'phone screen', 'next step', 'deadline']
    : []
  const terms = [...new Set([...entityTerms, ...recruitingTerms])]
  if (terms.length === 0) return []
  const structuredTerms = entityTerms.length > 0 ? entityTerms : recruitingTerms
  const contains = (term: string) => ({ contains: term, mode: 'insensitive' as const })
  const [taskResult, decisionResult] = await Promise.allSettled([
    prisma.task.findMany({
      where: {
        workspaceId: params.workspaceId,
        OR: structuredTerms.flatMap((term) => [
          { title: contains(term) },
          { description: contains(term) },
          { sourceTitle: contains(term) },
          { sourceSnippet: contains(term) },
        ]),
      },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 20,
    }),
    prisma.decision.findMany({
      where: {
        workspaceId: params.workspaceId,
        OR: structuredTerms.flatMap((term) => [
          { title: contains(term) },
          { decision: contains(term) },
          { reason: contains(term) },
        ]),
      },
      orderBy: [{ madeAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    }),
  ])
  const tasks = taskResult.status === 'fulfilled' ? taskResult.value : []
  const decisions = decisionResult.status === 'fulfilled' ? decisionResult.value : []

  const taskSources: QuerySource[] = tasks.map((task) => ({
    chunkId: `task:${task.id}`,
    pageId: null,
    pageTitle: task.title,
    notionPageId: null,
    content: [
      `Task: ${task.title}`,
      task.description,
      `Status: ${task.status}`,
      `Priority: ${task.priority}`,
      task.dueAt ? `Due: ${task.dueAt.toISOString()}` : null,
      task.sourceSnippet ? `Source context: ${task.sourceSnippet}` : null,
    ].filter(Boolean).join('\n'),
    labels: ['task', task.status, task.category],
    source: 'task',
    sourceUrl: task.sourceUrl,
    sourceExternalId: task.sourceId,
    owner: task.assignedToUserId,
    sourceMetadata: { originalSource: task.sourceType, dueAt: task.dueAt?.toISOString() ?? null },
    sourceCreatedAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    relevanceScore: 0.85,
    verified: true,
  }))
  const decisionSources: QuerySource[] = decisions.map((decision) => ({
    chunkId: `decision:${decision.id}`,
    pageId: null,
    pageTitle: decision.title,
    notionPageId: null,
    content: [
      `Decision: ${decision.title}`,
      decision.decision,
      decision.reason ? `Reason: ${decision.reason}` : null,
    ].filter(Boolean).join('\n'),
    labels: ['decision'],
    source: 'decision',
    sourceUrl: decision.sourceUrl,
    sourceExternalId: decision.id,
    owner: decision.madeBy,
    sourceMetadata: { originalSource: decision.source },
    sourceCreatedAt: decision.madeAt?.toISOString() ?? decision.createdAt.toISOString(),
    updatedAt: decision.createdAt.toISOString(),
    relevanceScore: 0.85,
    verified: true,
  }))
  return [...taskSources, ...decisionSources]
}

export async function POST(req: Request) {
  const startedAt = Date.now()
  const requestId = randomUUID()
  let failureStage = 'auth'
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
    failureStage = 'conversation_context'
    failureContext = { workspaceId, userId, displayName, queryLength: question.length }
    let recentMessages: Awaited<ReturnType<typeof loadRecentConversationMessages>> = []
    try {
      recentMessages = await loadRecentConversationMessages({
        workspaceId,
        userId,
        conversationId: requestedConversationId,
        take: 6,
      })
    } catch (err) {
      console.error('[query] conversation context unavailable', err instanceof Error ? err.message : 'unknown error')
    }
    const rewrite = rewriteQuery({ currentQuery: question, history: recentMessages })
    failureStage = 'retrieval'
    const retrievalQuery = rewrite.rewrittenQuery
    const escapedQuestion = escapeXml(retrievalQuery)
    const rewrittenIntent = detectQueryIntent(retrievalQuery)
    const intent = {
      ...rewrittenIntent,
      // Only an explicitly named integration should create a strict source filter.
      // Rewrites may mention "emails" as one evidence type without excluding Tasks.
      requestedSources: detectQueryIntent(question).requestedSources,
    }
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
        messageMetadata: {
          rewrittenQuery: rewrite.rewrittenQuery,
          detectedEntities: rewrite.detectedEntities,
          detectedIntent: rewrite.detectedIntent,
          sourceHints: rewrite.sourceHints,
          needsClarification: rewrite.needsClarification,
        },
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

    if (rewrite.needsClarification && rewrite.clarificationQuestion) {
      const answer = rewrite.clarificationQuestion
      const ranked = splitRankedSources([], 3, { query: retrievalQuery })
      if (conversationId) void storeAssistantMessage({
        workspaceId,
        userId,
        conversationId,
        answer,
        sourceReferences: [],
        documentReferences: [],
        relatedLoadId,
        metadata: { confidence: 0, answerPlan: planQueryAnswer(rewrite, []) as unknown as Prisma.InputJsonValue },
      }).catch(() => null)
      return new Response(makeStaticAnswerStream({ answer, ranked, documents: [], conversationId, confidence: 0, rewrite }), {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    const telegramCapabilityAnswer = telegramModeCapabilityAnswer(question)
    if (telegramCapabilityAnswer) {
      const ranked = splitRankedSources([], 3, { query: question })
      void safeSaveQueryLog(workspaceId, userId, displayName, question, telegramCapabilityAnswer, [])
      if (conversationId) {
        void storeAssistantMessage({
          workspaceId,
          userId,
          conversationId,
          answer: telegramCapabilityAnswer,
          sourceReferences: [],
          documentReferences: [],
          relatedLoadId,
          metadata: { confidence: 100, source: 'telegram_product' },
        }).catch(() => null)
      }
      await recordSuccessfulQuery({ workspaceId, userId, displayName, queryLength: question.length, sources: [], resultCount: 0, hasAnswer: true, confidence: 100, latencyMs: Date.now() - startedAt })
      return new Response(makeStaticAnswerStream({ answer: telegramCapabilityAnswer, ranked, documents: [], conversationId, confidence: 100 }), {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

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

    let embedding: number[] | null = null
    try {
      embedding = await generateEmbedding(retrievalQuery)
    } catch (err) {
      console.error('[query/safe]', { requestId, stage: 'embedding', errorName: err instanceof Error ? err.name : 'UnknownError' })
    }
    const personalNamespace = `${workspaceId}:${userId}`

    const [teamMatches, personalMatches] = embedding ? await Promise.all([
      searchSimilar(embedding, workspaceId, intent.requestedSources.length > 0 ? 20 : 10, 0.3).catch((err) => {
        console.error('[query/safe]', { requestId, stage: 'team_vector_retrieval', errorName: err instanceof Error ? err.name : 'UnknownError' })
        return []
      }),
      searchInNamespace(embedding, personalNamespace, 25, 0.3).catch((err) => {
        console.error('[query/safe]', { requestId, stage: 'personal_vector_retrieval', errorName: err instanceof Error ? err.name : 'UnknownError' })
        return []
      }),
    ]) : [[], []]

    const scoreMap = new Map<string, number>()
    for (const m of [...teamMatches, ...personalMatches]) {
      scoreMap.set(m.id, Math.max(scoreMap.get(m.id) ?? 0, m.score))
    }

    const allPineconeIds = [...scoreMap.keys()]
    const gmailSearchTerms = [...new Set([
      ...rewrite.entitySearchTerms,
      ...(/interview|recruiter|online assessment|\boa\b/i.test(retrievalQuery)
        ? ['interview', 'recruiter', 'technical', 'phone screen', 'onsite', 'next steps', 'assessment', 'CodeSignal', 'Karat', 'HackerRank']
        : []),
    ])]

    const chunkInclude = { page: { select: { id: true, title: true, notionPageId: true, lastEditedAt: true } } } as const

    let documentResults: DocumentResult[] = []
    try {
      documentResults = await searchDocumentAttachments(workspaceId, retrievalQuery)
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

    let gmailChunkSources: QuerySource[] = []
    try {
      gmailChunkSources = await findGmailChunkSources({
        workspaceId,
        userId,
        pineconeIds: allPineconeIds,
        terms: rewrite.entitySearchTerms.length ? rewrite.entitySearchTerms : gmailSearchTerms,
      })
    } catch (err) {
      console.error('[query/safe]', { requestId, stage: 'gmail_content_retrieval', errorName: err instanceof Error ? err.name : 'UnknownError' })
    }

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

    // Entity aliases are searched explicitly in Postgres in addition to vector
    // retrieval so acronyms such as HRT cannot lose their expanded form.
    if (rewrite.entitySearchTerms.length > 0) {
      const entityFilters = rewrite.entitySearchTerms.flatMap((term) => [
        { content: { contains: term, mode: 'insensitive' as const } },
        { summary: { contains: term, mode: 'insensitive' as const } },
        { reason: { contains: term, mode: 'insensitive' as const } },
        { label: { contains: term, mode: 'insensitive' as const } },
        { title: { contains: term, mode: 'insensitive' as const } },
        { notionPageTitle: { contains: term, mode: 'insensitive' as const } },
        { owner: { contains: term, mode: 'insensitive' as const } },
      ])
      const entityItems = await findKnowledgeItems({
        ...visibilityWhere(workspaceId, userId),
        OR: entityFilters,
      }, 30, [{ sourceCreatedAt: 'desc' }, { updatedAt: 'desc' }])
      const byId = new Map(knowledgeItems.map((item) => [item.id, item]))
      for (const item of entityItems) {
        if (!byId.has(item.id)) knowledgeItems.push(item)
        scoreMap.set(item.id, Math.max(scoreMap.get(item.id) ?? 0, 0.9))
      }
    }

    let structuredSources: QuerySource[] = []
    try {
      structuredSources = await findStructuredQuerySources({
        workspaceId,
        entityTerms: rewrite.entitySearchTerms,
        includeRecruiting: /interview|recruiter|online assessment|\boa\b/i.test(retrievalQuery),
      })
    } catch (err) {
      console.error('[query/safe]', { requestId, stage: 'structured_retrieval', errorName: err instanceof Error ? err.name : 'UnknownError' })
    }

    if (chunks.length === 0 && knowledgeItems.length === 0 && gmailChunkSources.length === 0 && documentResults.length === 0 && structuredSources.length === 0) {
      // Pinecone returned nothing — fall back to Postgres keyword search
      const keywords = [...new Set([...rewrite.entitySearchTerms, ...retrievalQuery.trim().split(/\s+/)])].filter(w => w.length > 2)
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

    if (chunks.length === 0 && knowledgeItems.length === 0 && gmailChunkSources.length === 0 && documentResults.length === 0 && structuredSources.length === 0) {
      const noInfoAnswer = intent.requestedSources.includes('slack')
        ? "I don’t see synced Slack messages yet. Connect Slack Personal Access and choose channels to sync."
        : intent.requestedSources.includes('telegram')
          ? "I don’t see synced Telegram messages yet. Connect Telegram Account Sync, choose chats, and sync selected messages."
        : /interview|recruiter|online assessment|\boa\b/i.test(retrievalQuery)
          ? `I couldn’t find enough synced data to confirm the exact interview count or status${rewrite.detectedEntities.length ? ` for ${rewrite.detectedEntities.join(', ')}` : ''}. I checked the available workspace knowledge, email-derived memory, tasks, and decisions, but no supporting source matched. I won’t infer dates, recruiters, or next steps without evidence.`
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
          metadata: { confidence: 0, totalSources: 0, documentCount: 0, rewrittenQuery: retrievalQuery, detectedEntities: rewrite.detectedEntities, detectedIntent: rewrite.detectedIntent },
        }).catch((err) => console.error('[query] assistant persistence failed', err))
      }
      void safeSaveQueryLog(workspaceId, userId, displayName, question, noInfoAnswer, [])
      await recordSuccessfulQuery({ workspaceId, userId, displayName, queryLength: question.length, sources: [], resultCount: 0, hasAnswer: true, confidence: 0, latencyMs: Date.now() - startedAt })
      return new Response(makeEmptyStream(noInfoAnswer, conversationId, 0, rewrite), { headers: { 'Content-Type': 'text/event-stream' } })
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
      content: [item.content, item.summary ? `Summary: ${item.summary}` : null, item.reason ? `Reason: ${item.reason}` : null, item.alternatives ? `Alternatives: ${item.alternatives}` : null].filter(Boolean).join('\n'),
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

    const candidateSources = [...gmailChunkSources, ...chunkSources, ...knowledgeSources, ...structuredSources]
      .filter((source) => sourceMatchesEntity(source, rewrite.entitySearchTerms))
    const ranked = splitRankedSources(candidateSources, 3, {
      requestedSources: intent.requestedSources,
      temporalType: intent.temporalIntent.type,
      query: retrievalQuery,
      entityTerms: rewrite.entitySearchTerms,
    })
    if (ranked.totalSources === 0 && rewrite.entitySearchTerms.length > 0) {
      const answer = /interview|recruiter|online assessment|\boa\b/i.test(retrievalQuery)
        ? `I couldn’t find enough synced data to confirm the exact interview count or status for ${rewrite.detectedEntities.join(', ')}. I won’t infer dates, recruiters, or next steps without a matching source.`
        : `I couldn’t find a synced source that mentions ${rewrite.detectedEntities.join(', ')}. I don’t have verified information about this yet.`
      if (conversationId) void storeAssistantMessage({
        workspaceId,
        userId,
        conversationId,
        answer,
        sourceReferences: [],
        documentReferences: [],
        relatedLoadId,
        metadata: { confidence: 0, rewrittenQuery: retrievalQuery, detectedEntities: rewrite.detectedEntities, detectedIntent: rewrite.detectedIntent },
      }).catch(() => null)
      void safeSaveQueryLog(workspaceId, userId, displayName, question, answer, [])
      return new Response(makeStaticAnswerStream({ answer, ranked, documents: [], conversationId, confidence: 0, rewrite }), {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    const interviewEvidenceAnswer = buildDetailedInterviewAnswer(rewrite, ranked.sources)
    if (interviewEvidenceAnswer) {
      const evidenceSources = ranked.sources.slice(0, 8)
      const evidenceRanked = splitRankedSources(evidenceSources, 3, {
        query: retrievalQuery,
        entityTerms: rewrite.entitySearchTerms,
      })
      void safeSaveQueryLog(workspaceId, userId, displayName, question, interviewEvidenceAnswer, evidenceSources.map((source) => source.chunkId))
      if (conversationId) void storeAssistantMessage({
        workspaceId,
        userId,
        conversationId,
        answer: interviewEvidenceAnswer,
        sourceReferences: evidenceSources as unknown as Prisma.InputJsonValue,
        documentReferences: [],
        relatedLoadId,
        metadata: { confidence, rewrittenQuery: retrievalQuery, detectedEntities: rewrite.detectedEntities, detectedIntent: rewrite.detectedIntent },
      }).catch(() => null)
      return new Response(makeStaticAnswerStream({ answer: interviewEvidenceAnswer, ranked: evidenceRanked, documents: [], conversationId, confidence, rewrite }), {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    const answerContextSources = ranked.sources.slice(0, intent.queryType === 'summary' ? 12 : 8)
    const context = [
      attachedDocumentContext(attachedDocuments),
      ...answerContextSources.map((source, index) => formatSourceForModel(source, index)),
      documentContext(documentResults),
    ].filter(Boolean).join('\n\n')
    const answerPlan = planQueryAnswer(rewrite, answerContextSources)
    const conversationContext = recentMessages
      .map((message) => `${message.role}: ${message.content.slice(0, 800)}`)
      .join('\n')
    const retrievalDebug = retrievalDebugPayload({
      query: retrievalQuery,
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

    failureStage = 'answer_generation'
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
            detectedIntent: rewrite.detectedIntent,
            detectedEntities: rewrite.detectedEntities,
          }))}</intent>\n\n<recent_conversation>${escapeXml(conversationContext)}</recent_conversation>\n\n<internal_answer_plan>${escapeXml(JSON.stringify(answerPlan))}</internal_answer_plan>\n\n<answer_rules>
Use the provided workspace knowledge. If sources are present, summarize or explain those sources; do not claim there is no information unless the provided sources are genuinely irrelevant. Do not recommend public official channels for workspace questions.
For interview or recruiting questions: start with a direct sourced count/status when supported, then list status and evidence. State clearly when the exact count, date, recruiter, or next step is not supported. Never invent dates, people, interview stages, or statuses. Mention Gmail and Task evidence using their source citations. End by offering a follow-up task/reminder only when useful.
</answer_rules>\n\n<knowledge_items>\n${context}\n</knowledge_items>`,
        },
      ],
      temperature: 0.2,
    })

    const readable = new ReadableStream({
      async start(controller) {
        sendSSE(controller, { type: 'sources', ...ranked, documents: documentResults, conversationId, confidence, ...(retrievalDebug ? { retrievalDebug } : {}), ...interpretationPayload(rewrite) })
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
                rewrittenQuery: retrievalQuery,
                detectedEntities: rewrite.detectedEntities,
                detectedIntent: rewrite.detectedIntent,
                answerPlan: answerPlan as unknown as Prisma.InputJsonValue,
                ...(documentIds.length > 0 ? { uploadedDocumentIds: documentIds } : {}),
              },
            }).catch((err) => console.error('[query] assistant persistence failed', err))
          }
          const answer = fullAnswer.trim() || 'I could not find enough information to answer confidently, but these are the closest sources I found.'
          await recordSuccessfulQuery({ workspaceId, userId, displayName, queryLength: question.length, sources: ranked.sources, resultCount: ranked.totalSources, hasAnswer: Boolean(answer.trim()), confidence, latencyMs: Date.now() - startedAt })
          sendSSE(controller, { type: 'done', answer, ...ranked, documents: documentResults, conversationId, confidence, ...(retrievalDebug ? { retrievalDebug } : {}), ...interpretationPayload(rewrite) })
        } catch (err) {
          console.error('[query/safe]', { requestId, stage: 'answer_stream', errorName: err instanceof Error ? err.name : 'UnknownError' })
          sendSSE(controller, {
            type: 'error',
            ok: false,
            error: 'query_answer_failed',
            message: "I couldn't answer this because the query service failed. Please try again.",
            requestId,
          })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } })
  } catch (err) {
    console.error('[query/safe]', {
      requestId,
      stage: failureStage,
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: err instanceof Error ? err.message.slice(0, 240) : 'unknown error',
      hasWorkspace: Boolean(failureContext?.workspaceId),
      hasUser: Boolean(failureContext?.userId),
      queryLength: failureContext?.queryLength ?? null,
    })
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
    return NextResponse.json({
      ok: false,
      error: 'query_answer_failed',
      message: "I couldn't answer this because the query service failed. Please try again.",
      requestId,
    }, { status: 500 })
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
