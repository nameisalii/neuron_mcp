import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbeddingInNamespace } from '@/lib/pinecone'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import { trackEvent } from '@/lib/activity'
import { escapeXml } from '@/lib/utils'
import { isTransientPrismaError, withPrismaRetry } from '@/lib/db/retry'
import { getGmailNamespace, getGmailSyncMaxMessages, getGmailBackfillMaxMessages, getGmailBackfillPageSize } from './config'
import type { GmailBackfillCursor, GmailSyncMetadata, GmailSyncStats, SlackMessage } from '@/types'
import {
  buildSearchQuery,
  getAccessToken,
  getMessage,
  gmailThreadUrl,
  listRecentMessageIds,
  listMessageIds,
  parseMessage,
  sleep,
  GmailApiError,
  type ParsedEmailMessage,
} from './api'

// Hard cap so a misconfigured label can never trigger a runaway sync.
export const MAX_MESSAGES_PER_SYNC = 500
// Gmail allows 250 quota units/sec; messages.get costs 5 units, so 40 fetches
// per batch with a 1s pause stays well under the limit.
export const MESSAGE_BATCH_SIZE = 40
const BATCH_DELAY_MS = 1000
const DB_THREAD_CONCURRENCY = 4
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_EMAIL_EMBEDDING_CHARS = 6000
const MAX_EMAIL_EXTRACTION_CHARS = 12000
const SYSTEM_LABEL_MAP: Record<string, string> = {
  inbox: 'INBOX',
  sent: 'SENT',
  important: 'IMPORTANT',
  starred: 'STARRED',
  spam: 'SPAM',
  trash: 'TRASH',
}

export interface GmailSyncInput {
  workspaceId: string
  accessToken: string // encrypted refresh token from Integration.accessToken
  syncedBy: string // Clerk userId — attribution
  syncedByName: string
  metadata: GmailSyncMetadata
  lastSyncAt?: Date | null
  mode?: 'recent' | 'backfill'
  lookbackDays?: number | null
  maxMessages?: number
  includeArchived?: boolean
}

export interface GmailSyncResult {
  success: boolean
  threadsProcessed: number
  messagesProcessed: number
  extractedKnowledgeItems: number
  aiExtractedKnowledgeItems: number
  fallbackKnowledgeItems: number
  chunksEmbedded: number
  skippedDuplicates?: number
  embeddingFailures?: number
  extractionDiagnostics: GmailExtractionDiagnostics
  deleted: number
  skipped: number
  skippedReasons: Record<string, number>
  capped: boolean
  labelsScanned: number
  selectedLabels: string[]
  labelIdsUsed: string[]
  gmailQueryUsed: string
  messagesFoundBeforeFiltering: number
  messagesFetched: number
  threadsCreated: number
  chunksCreated: number
  syncFrom: string | null
  configuredSyncFrom: string | null
  effectiveQueryStart: string
  lastSyncAtBeforeRun: string | null
  lastSyncAtAfterRun: string | null
  lastSyncAttemptAt: string
  lastSuccessfulImportAt: string | null
  namespaceUsed: string
  lastSyncedAt: string | null
  importedThreads: number
  importedChunks: number
  canReadMailbox?: boolean
  recentMessagesAvailable?: number
  inboxMessagesAvailable?: number
  sentMessagesAvailable?: number
  diagnosticRecentCount?: number
  diagnosticInboxCount?: number
  diagnosticSentCount?: number
  message?: string
  stats?: GmailSyncStats
  hasMore?: boolean
  nextPageToken?: GmailBackfillCursor | null
  errorsSummary?: Record<string, number>
}

export interface GmailExtractionDiagnostics extends ExtractionDiagnostics {
  extractorNotCalled: number
  contentTooShort: number
  skippedPromotional: number
  skippedNoUsefulSignal: number
  fallbackCreateFailed: number
}

function emptyGmailExtractionDiagnostics(): GmailExtractionDiagnostics {
  return {
    extractorCalled: 0,
    extractorNotCalled: 0,
    extractorReturnedEmpty: 0,
    extractorParseFailed: 0,
    validationFailed: 0,
    fallbackItemsCreated: 0,
    knowledgeItemCreateFailed: 0,
    embeddingUpsertFailed: 0,
    itemProcessingFailed: 0,
    contentTooShort: 0,
    skippedPromotional: 0,
    skippedNoUsefulSignal: 0,
    fallbackCreateFailed: 0,
  }
}

function addExtractionDiagnostics(
  target: GmailExtractionDiagnostics,
  source: Partial<GmailExtractionDiagnostics>,
): void {
  for (const key of Object.keys(target) as Array<keyof GmailExtractionDiagnostics>) {
    target[key] += source[key] ?? 0
  }
}

function labelNamesFor(message: ParsedEmailMessage, metadata: GmailSyncMetadata): string[] {
  const names = message.labelIds.map((id) => {
    const idx = metadata.selectedLabels.indexOf(id)
    return idx >= 0 ? (metadata.selectedLabelNames[idx] ?? id) : null
  })
  return names.filter((n): n is string => n !== null)
}

function normalizeGmailLabelId(label: string): string {
  const normalized = label.trim()
  if (!normalized) return normalized
  return SYSTEM_LABEL_MAP[normalized.toLowerCase()] ?? normalized
}

function resolveSelectedLabelIds(labels: string[]): string[] {
  const resolved: string[] = []
  const seen = new Set<string>()
  for (const label of labels) {
    const id = normalizeGmailLabelId(label)
    if (!id || seen.has(id)) continue
    seen.add(id)
    resolved.push(id)
  }
  return resolved
}

async function collectMessages(
  accessToken: string,
  metadata: GmailSyncMetadata,
  query: string,
  options: { mode: 'recent' | 'backfill'; maxMessages: number; lookbackDays: number | null; includeArchived: boolean; cursor?: GmailBackfillCursor | null },
): Promise<{
  messages: ParsedEmailMessage[]
  skipped: number
  capped: boolean
  messagesFoundBeforeFiltering: number
  labelIdsUsed: string[]
  skippedReasons: Record<string, number>
  cursor: GmailBackfillCursor | null
}> {
  const seen = new Map<string, { id: string; threadId: string }>()
  const seenThreads = new Set<string>()
  let capped = false
  const maxMessages = Math.max(1, Math.min(options.maxMessages, MAX_MESSAGES_PER_SYNC))
  let messagesFoundBeforeFiltering = 0
  const skippedReasons: Record<string, number> = {}
  const labelIdsUsed = resolveSelectedLabelIds(metadata.selectedLabels)
  const sources = options.includeArchived ? ['ARCHIVED'] : labelIdsUsed
  const pageTokens: Record<string, string> = { ...(options.cursor?.pageTokens ?? {}) }
  const completedSources = new Set(options.cursor?.completedSources ?? [])
  const perSourceBudget = Math.max(1, Math.ceil(maxMessages / Math.max(1, sources.length)))

  for (const labelId of sources) {
    if (completedSources.has(labelId)) continue
    if (seen.size >= maxMessages) {
      capped = true
      break
    }
    const page = await listMessageIds(accessToken, {
      labelIds: labelId === 'ARCHIVED' ? undefined : [labelId],
      query,
      cap: Math.min(perSourceBudget, maxMessages - seen.size),
      pageSize: options.mode === 'backfill' ? getGmailBackfillPageSize() : undefined,
      pageToken: pageTokens[labelId],
    })
    messagesFoundBeforeFiltering += page.ids.length
    for (const ref of page.ids) seen.set(ref.id, ref)
    if (page.nextPageToken) pageTokens[labelId] = page.nextPageToken
    else {
      delete pageTokens[labelId]
      completedSources.add(labelId)
    }
    if (page.hasMore) capped = true
  }

  const refs = [...seen.values()]
  const messages: ParsedEmailMessage[] = []
  let skipped = 0

  for (let i = 0; i < refs.length; i += MESSAGE_BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY_MS)
    const batch = refs.slice(i, i + MESSAGE_BATCH_SIZE)
    for (const ref of batch) {
      try {
        const raw = await getMessage(accessToken, ref.id)
        const parsed = parseMessage(raw)
        if (parsed) {
          if (!seenThreads.has(parsed.threadId)) {
            seenThreads.add(parsed.threadId)
          }
          messages.push(parsed)
        } else {
          skipped++
          skippedReasons.parse_failed = (skippedReasons.parse_failed ?? 0) + 1
        }
      } catch (err) {
        console.error('[gmail/sync] message fetch failed; continuing', err instanceof GmailApiError ? { status: err.status } : { type: 'unknown' })
        skipped++
        skippedReasons.message_fetch_failed = (skippedReasons.message_fetch_failed ?? 0) + 1
      }
    }
  }

  const hasMore = completedSources.size < sources.length || Object.keys(pageTokens).length > 0
  return {
    messages, skipped, capped: capped || hasMore, messagesFoundBeforeFiltering, labelIdsUsed, skippedReasons,
    cursor: hasMore ? {
      lookbackDays: options.lookbackDays,
      includeArchived: options.includeArchived,
      pageTokens,
      completedSources: [...completedSources],
    } : null,
  }
}

function groupByThread(messages: ParsedEmailMessage[]): Map<string, ParsedEmailMessage[]> {
  const threads = new Map<string, ParsedEmailMessage[]>()
  for (const message of messages) {
    const existing = threads.get(message.threadId) ?? []
    threads.set(message.threadId, [...existing, message])
  }
  // Order each thread chronologically without mutating the original arrays
  return new Map(
    [...threads.entries()].map(([threadId, msgs]) => [
      threadId,
      [...msgs].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
    ]),
  )
}

function boundedEmailText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[Email content truncated for processing]`
}

const PROMOTIONAL_SIGNAL = /\b(unsubscribe|view in browser|special offer|limited time|shop now|sale ends|marketing preferences|edit settings|job alert|be the first to apply|recommended for you)\b/i
const AUTOMATED_SENDER = /\b(no-?reply|donotreply|notifications?|mailer-daemon|newsletter|marketing)\b/i
const AUTOMATED_TRANSACTIONAL_SUBJECT = /\b(password reset|verification code|security code|secure verification|two[- ]step verification|one[- ]time code|login code|receipt|invoice|order confirmation|domain contact information|domain (?:renewal|expiration)|payment (?:received|failed)|shipping confirmation|delivery update|subscription (?:renewal|confirmation)|account notice)\b/i

function firstUsefulSentence(body: string): string | null {
  const sentence = body
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find((part) => part.length >= 20 && !PROMOTIONAL_SIGNAL.test(part))
  return sentence ? sentence.slice(0, 280) : null
}

function fallbackMemoryContent(message: ParsedEmailMessage, diagnostics: GmailExtractionDiagnostics): string | null {
  const subject = message.subject.trim()
  const body = message.body.trim()
  if (!subject || body.length < 40) {
    diagnostics.contentTooShort++
    return null
  }
  if (AUTOMATED_SENDER.test(message.from) || PROMOTIONAL_SIGNAL.test(`${subject} ${body}`) || AUTOMATED_TRANSACTIONAL_SUBJECT.test(subject)) {
    diagnostics.skippedPromotional++
    return null
  }
  const summary = firstUsefulSentence(body)
  if (!summary && !message.labelIds.some((label) => label === 'IMPORTANT' || label === 'STARRED')) {
    diagnostics.skippedNoUsefulSignal++
    return null
  }
  return `Email from ${message.from || 'unknown sender'} about ${subject}: ${summary ?? subject}`
}

async function createFallbackKnowledgeItem(
  input: GmailSyncInput,
  threadId: string,
  messages: ParsedEmailMessage[],
  personalNamespace: string,
  diagnostics: GmailExtractionDiagnostics,
): Promise<number> {
  const candidate = [...messages].reverse().find((message) => fallbackMemoryContent(message, emptyGmailExtractionDiagnostics()))
  if (!candidate) {
    for (const message of messages) fallbackMemoryContent(message, diagnostics)
    return 0
  }
  const content = fallbackMemoryContent(candidate, diagnostics)
  if (!content) return 0

  const existing = await withPrismaRetry(() => prisma.knowledgeItem.findFirst({
    where: {
      workspaceId: input.workspaceId,
      source: 'gmail',
      sourceExternalId: threadId,
      visibility: 'personal',
      visibilitySetBy: input.syncedBy,
    },
    select: { id: true },
  }))
  if (existing) return 0

  const contentHash = `gmail:${input.syncedBy}:${threadId}`.slice(0, 100)
  try {
    const dbItem = await withPrismaRetry(() => prisma.knowledgeItem.create({
      data: {
        workspaceId: input.workspaceId,
        content,
        contentHash,
        category: 'reference',
        aiSuggestedCategory: 'reference',
        source: 'gmail',
        sourceUrl: gmailThreadUrl(threadId),
        sourceExternalId: threadId,
        owner: candidate.from || null,
        confidence: 0.5,
        visibility: 'personal',
        visibilitySetBy: input.syncedBy,
        sourceCreatedAt: new Date(candidate.date),
        notionPageTitle: candidate.subject,
      },
      select: { id: true },
    }))
    try {
      const embedding = await generateEmbedding(boundedEmailText(content, MAX_EMAIL_EMBEDDING_CHARS))
      await upsertEmbeddingInNamespace(
        dbItem.id,
        embedding,
        { workspaceId: input.workspaceId, category: 'reference', source: 'gmail' },
        personalNamespace,
      )
      await withPrismaRetry(() => prisma.knowledgeItem.update({
        where: { id: dbItem.id },
        data: { embeddingId: dbItem.id },
      }))
      return 1
    } catch (err) {
      diagnostics.embeddingUpsertFailed++
      console.error('[gmail/sync] fallback embedding failed; source record preserved', err instanceof Error ? err.name : 'unknown')
      return 1
    }
  } catch (err) {
    diagnostics.fallbackCreateFailed++
    console.error('[gmail/sync] fallback knowledge creation failed', err)
    return 0
  }
}

async function syncThread(
  input: GmailSyncInput,
  threadId: string,
  messages: ParsedEmailMessage[],
  personalNamespace: string,
): Promise<{
  aiExtractedKnowledgeItems: number
  fallbackKnowledgeItems: number
  deleted: number
  chunksCreated: number
  chunksEmbedded: number
  skippedDuplicates: number
  embeddingFailures: number
  databaseFailures: number
  messageFailures: number
  extractionDiagnostics: GmailExtractionDiagnostics
}> {
  const { workspaceId, syncedBy, metadata } = input
  const first = messages[0]
  const last = messages[messages.length - 1]
  const url = gmailThreadUrl(threadId)
  const threadLabelNames = [...new Set(messages.flatMap((m) => labelNamesFor(m, metadata)))]

  const dbThread = await withPrismaRetry(() => prisma.emailThread.upsert({
    where: { workspaceId_gmailThreadId: { workspaceId, gmailThreadId: threadId } },
    create: {
      gmailThreadId: threadId,
      workspaceId,
      subject: escapeXml(first.subject),
      labelNames: threadLabelNames,
      messageCount: messages.length,
      lastMessageAt: new Date(last.date),
      syncedBy,
      syncedAt: new Date(),
    },
    update: {
      subject: escapeXml(first.subject),
      labelNames: threadLabelNames,
      messageCount: messages.length,
      lastMessageAt: new Date(last.date),
      syncedBy,
      syncedAt: new Date(),
    },
  }))

  // Preserve prior chunks. A bounded page may contain only part of a thread,
  // so replacing the thread here used to discard messages from earlier runs.
  const existingChunks = await withPrismaRetry(() => prisma.emailChunk.findMany({
    where: { emailThreadId: dbThread.id },
    select: { metadata: true },
  }))
  const existingMessageIds = new Set(existingChunks.flatMap((chunk) => {
    const metadata = chunk.metadata as { messageId?: unknown } | null
    return typeof metadata?.messageId === 'string' ? [metadata.messageId] : []
  }))
  const deleted = 0
  let chunksCreated = 0
  let chunksEmbedded = 0
  let skippedDuplicates = 0
  let embeddingFailures = 0
  let databaseFailures = 0
  let messageFailures = 0

  for (const [position, message] of messages.entries()) {
    if (existingMessageIds.has(message.messageId)) {
      skippedDuplicates++
      continue
    }
    const content = escapeXml(message.body)
    const pineconeId = `${workspaceId}-gmail-${message.messageId}`

    try {
      const chunk = await withPrismaRetry(() => prisma.emailChunk.create({
      data: {
        emailThreadId: dbThread.id,
        workspaceId,
        content,
        blockType: 'email_message',
        position: existingChunks.length + position,
        metadata: {
          threadId,
          messageId: message.messageId,
          subject: message.subject,
          from: message.from,
          to: message.to,
          date: message.date,
          labelNames: labelNamesFor(message, metadata),
          sourceCreatedAt: message.date,
          isThread: true,
          threadPosition: position,
          url,
        } as Prisma.InputJsonValue,
        pineconeId: null,
        labels: [] as Prisma.InputJsonValue,
        labeledBy: [] as Prisma.InputJsonValue,
        // Email is private by default — only the syncing user can see it
        visibility: 'personal',
        visibilitySetBy: syncedBy,
      },
      }))
      chunksCreated++
      try {
        const embedding = await generateEmbedding(boundedEmailText(content, MAX_EMAIL_EMBEDDING_CHARS))
        await upsertEmbeddingInNamespace(pineconeId, embedding, { workspaceId, source: 'gmail' }, personalNamespace)
        if (prisma.emailChunk.update) {
          await withPrismaRetry(() => prisma.emailChunk.update({ where: { id: chunk.id }, data: { pineconeId } }))
        }
        chunksEmbedded++
      } catch {
        embeddingFailures++
      }
    } catch (err) {
      console.error('[gmail/sync] message database write failed; continuing', err instanceof Error ? err.name : 'unknown')
      if (isTransientPrismaError(err)) databaseFailures++
      else messageFailures++
    }
  }

  if (prisma.emailThread.update) {
    await withPrismaRetry(() => prisma.emailThread.update({
      where: { id: dbThread.id },
      data: { messageCount: existingChunks.length + chunksCreated },
    }))
  }

  // Extracted knowledge inherits the same personal privacy as the chunks
  const extractionMessages: SlackMessage[] = messages.map((m) => ({
    text: boundedEmailText(escapeXml(m.body), MAX_EMAIL_EXTRACTION_CHARS),
    user: escapeXml(m.from),
    channel: escapeXml(m.subject),
    ts: String(Date.parse(m.date) / 1000),
    permalink: url,
  }))
  const extraction = await extractKnowledgeDetailed(extractionMessages, workspaceId, 'gmail', url, threadId, undefined, {
    namespace: personalNamespace,
    visibility: 'personal',
    visibilitySetBy: syncedBy,
  })
  const extractionDiagnostics = emptyGmailExtractionDiagnostics()
  addExtractionDiagnostics(extractionDiagnostics, extraction.diagnostics)
  const fallbackKnowledgeItems = extraction.items.length === 0
    ? await createFallbackKnowledgeItem(input, threadId, messages, personalNamespace, extractionDiagnostics)
    : 0

  return {
    aiExtractedKnowledgeItems: extraction.items.length,
    fallbackKnowledgeItems,
    deleted,
    chunksCreated,
    chunksEmbedded,
    skippedDuplicates,
    embeddingFailures,
    databaseFailures,
    messageFailures,
    extractionDiagnostics,
  }
}

export async function syncGmail(input: GmailSyncInput): Promise<GmailSyncResult> {
  const { workspaceId, syncedBy, syncedByName, metadata, lastSyncAt } = input
  const mode = input.mode ?? 'recent'
  const lookbackDays = input.lookbackDays === undefined
    ? (mode === 'recent' ? 30 : 90)
    : input.lookbackDays
  const maxMessages = input.maxMessages ?? (mode === 'backfill' ? getGmailBackfillMaxMessages() : getGmailSyncMaxMessages())

  if (!metadata?.selectedLabels?.length) {
    throw new Error('Gmail is not configured — please configure which emails to sync first')
  }

  const refreshToken = decrypt(input.accessToken)
  const accessToken = await getAccessToken(refreshToken)

  // Only a sync that imported email may advance the incremental cursor.
  // Integration.lastSyncAt is an attempt/display timestamp and must not be
  // used as the query boundary after an empty or failed run.
  const syncAttemptAt = new Date()
  const configuredSyncFrom = metadata.syncFrom ? new Date(metadata.syncFrom) : null
  const windowStart = lookbackDays === null
    ? null
    : configuredSyncFrom && !Number.isNaN(configuredSyncFrom.getTime()) && input.lookbackDays === undefined
    ? configuredSyncFrom
    : new Date(Date.now() - lookbackDays * DAY_MS)
  const previousSuccessfulImportAt = metadata.lastSuccessfulImportAt
    ? new Date(metadata.lastSuccessfulImportAt)
    : null
  const validPreviousSuccessfulImportAt = previousSuccessfulImportAt
    && !Number.isNaN(previousSuccessfulImportAt.getTime())
    ? previousSuccessfulImportAt
    : null
  const afterDate = mode === 'recent' && windowStart && validPreviousSuccessfulImportAt && validPreviousSuccessfulImportAt > windowStart
    ? validPreviousSuccessfulImportAt
    : windowStart
  const query = `${afterDate ? buildSearchQuery(afterDate, metadata.senderFilter ?? [], metadata.excludeFilter ?? []) : ''} -in:spam -in:trash`.trim()
  const resolvedSelectedLabels = resolveSelectedLabelIds(metadata.selectedLabels)
  const normalizedMetadata: GmailSyncMetadata = {
    ...metadata,
    selectedLabels: resolvedSelectedLabels,
    maxMessages,
  }

  const personalNamespace = getGmailNamespace(workspaceId, syncedBy)
  const lastSyncAtBeforeRun = lastSyncAt?.toISOString() ?? null
  const {
    messages,
    skipped,
    capped,
    messagesFoundBeforeFiltering,
    labelIdsUsed,
    skippedReasons,
    cursor,
  } = await collectMessages(accessToken, normalizedMetadata, query, {
    mode,
    maxMessages,
    includeArchived: Boolean(input.includeArchived),
    lookbackDays,
    cursor: mode === 'backfill'
      && metadata.backfillCursor?.lookbackDays === lookbackDays
      && metadata.backfillCursor.includeArchived === Boolean(input.includeArchived)
      ? metadata.backfillCursor
      : null,
  })
  const threads = groupByThread(messages)

  let threadsProcessed = 0
  let messagesProcessed = 0
  let threadsFailed = 0
  let aiExtractedKnowledgeItems = 0
  let fallbackKnowledgeItems = 0
  let deleted = 0
  let chunksCreated = 0
  let chunksEmbedded = 0
  let skippedDuplicates = 0
  let embeddingFailures = 0
  let databaseFailures = 0
  let messageFailures = 0
  const extractionDiagnostics = emptyGmailExtractionDiagnostics()

  const threadEntries = [...threads.entries()]
  for (let offset = 0; offset < threadEntries.length; offset += DB_THREAD_CONCURRENCY) {
    const batch = threadEntries.slice(offset, offset + DB_THREAD_CONCURRENCY)
    const results = await Promise.allSettled(batch.map(([threadId, threadMessages]) =>
      syncThread({ ...input, metadata: normalizedMetadata }, threadId, threadMessages, personalNamespace)
        .then((result) => ({ result, messageCount: threadMessages.length })),
    ))
    for (const settled of results) {
      if (settled.status === 'rejected') {
        console.error('[gmail/sync] thread processing failed; continuing', settled.reason instanceof Error ? settled.reason.name : 'unknown')
        threadsFailed++
        skippedReasons.thread_failed = (skippedReasons.thread_failed ?? 0) + 1
        continue
      }
      const { result, messageCount } = settled.value
      aiExtractedKnowledgeItems += result.aiExtractedKnowledgeItems
      fallbackKnowledgeItems += result.fallbackKnowledgeItems
      deleted += result.deleted
      chunksCreated += result.chunksCreated
      chunksEmbedded += result.chunksEmbedded
      skippedDuplicates += result.skippedDuplicates
      embeddingFailures += result.embeddingFailures
      databaseFailures += result.databaseFailures
      messageFailures += result.messageFailures
      addExtractionDiagnostics(extractionDiagnostics, result.extractionDiagnostics)
      threadsProcessed++
      messagesProcessed += messageCount
    }
  }

  const successfulImport = messagesProcessed > 0
  const extractedKnowledgeItems = aiExtractedKnowledgeItems + fallbackKnowledgeItems
  const lastSyncAttemptAt = syncAttemptAt.toISOString()
  const lastSuccessfulImportAt = successfulImport
    ? lastSyncAttemptAt
    : metadata.lastSuccessfulImportAt ?? null
  const lastSyncAtAfterRun = lastSyncAttemptAt
  const stats: GmailSyncStats = {
    mode,
    fetched: messagesFoundBeforeFiltering,
    processed: messagesProcessed,
    created: chunksCreated,
    updated: 0,
    skippedDuplicates,
    skippedNoContent: skippedReasons.parse_failed ?? 0,
    skippedUnsupported: 0,
    failed: threadsFailed + (skippedReasons.message_fetch_failed ?? 0) + embeddingFailures + databaseFailures + messageFailures,
    hasMore: Boolean(cursor),
    errorsSummary: { ...skippedReasons, ...(embeddingFailures ? { embedding_failed: embeddingFailures } : {}), ...(databaseFailures ? { database_write_failed: databaseFailures } : {}), ...(messageFailures ? { message_processing_failed: messageFailures } : {}) },
  }

  await withPrismaRetry(() => prisma.integration.update({
    where: { workspaceId_type: { workspaceId, type: 'gmail' } },
    data: {
      lastSyncAt: syncAttemptAt,
      metadata: {
        ...normalizedMetadata,
        lastSyncAttemptAt,
        lastSyncStatus: stats.failed > 0 || stats.hasMore ? 'partial' : 'completed',
        lastSyncError: null,
        lastSyncStats: stats,
        ...(mode === 'backfill' ? {
          backfillCursor: cursor,
          backfillStatus: cursor ? 'partial' : 'completed',
          backfillStartedAt: metadata.backfillStartedAt ?? lastSyncAttemptAt,
          ...(!cursor ? { backfillFinishedAt: lastSyncAttemptAt } : {}),
        } : {}),
        ...(lastSuccessfulImportAt ? { lastSuccessfulImportAt } : {}),
      } as unknown as Prisma.InputJsonValue,
    },
  }))

  let canReadMailbox = true
  let recentMessagesAvailable: number | undefined
  let inboxMessagesAvailable: number | undefined
  let sentMessagesAvailable: number | undefined
  if (!successfulImport) {
    try {
      const [recent, inbox, sent] = await Promise.all([
        listRecentMessageIds(accessToken, { query: '', cap: 5 }),
        listRecentMessageIds(accessToken, { labelIds: ['INBOX'], query: '', cap: 5 }),
        listRecentMessageIds(accessToken, { labelIds: ['SENT'], query: '', cap: 5 }),
      ])
      recentMessagesAvailable = recent.ids.length
      inboxMessagesAvailable = inbox.ids.length
      sentMessagesAvailable = sent.ids.length
    } catch (err) {
      canReadMailbox = !(err instanceof GmailApiError && (err.status === 401 || err.status === 403))
    }
  }

  const selectedCoreLabels = new Set(resolvedSelectedLabels)
  const coreLabelsHaveMessages = (inboxMessagesAvailable ?? 0) > 0 || (sentMessagesAvailable ?? 0) > 0
  const selectedLabelsText = resolvedSelectedLabels.join(' or ')
  const zeroMessageFallback = !successfulImport
    ? canReadMailbox
      ? coreLabelsHaveMessages && !selectedCoreLabels.has('INBOX') && !selectedCoreLabels.has('SENT')
        ? `No emails matched ${selectedLabelsText}. Inbox and Sent have readable messages. Add Inbox or Sent to sync.`
        : coreLabelsHaveMessages || (recentMessagesAvailable ?? 0) > 0
          ? 'Gmail is connected, but your selected labels have no matching emails. Add Inbox or Sent, or widen date range.'
          : 'No readable messages were found in the selected Gmail labels.'
      : 'Gmail permission issue. Please reconnect Gmail with read-only access.'
    : null

  await trackEvent(
    workspaceId,
    syncedBy,
    syncedByName,
    'sync',
    `[${syncedByName}] synced ${threadsProcessed} email threads from Gmail`,
    {
      integration: 'gmail',
      threadsProcessed,
      messagesProcessed,
      extractedKnowledgeItems,
      aiExtractedKnowledgeItems,
      fallbackKnowledgeItems,
      chunksEmbedded,
      extractionDiagnostics,
      skipped,
      threadsFailed,
      capped,
      labelsScanned: resolvedSelectedLabels.length,
      namespaceUsed: personalNamespace,
      selectedLabels: resolvedSelectedLabels,
      labelIdsUsed,
      gmailQueryUsed: query,
      messagesFoundBeforeFiltering,
      messagesFetched: messages.length,
      threadsCreated: threadsProcessed,
      chunksCreated,
      skippedReasons,
      syncFrom: metadata.syncFrom ?? null,
      configuredSyncFrom: metadata.syncFrom ?? null,
      effectiveQueryStart: afterDate?.toISOString() ?? null,
      lastSyncAtBeforeRun,
      lastSyncAtAfterRun,
      lastSyncAttemptAt,
      lastSuccessfulImportAt,
      canReadMailbox,
      recentMessagesAvailable,
      inboxMessagesAvailable,
      sentMessagesAvailable,
      diagnosticRecentCount: recentMessagesAvailable,
      diagnosticInboxCount: inboxMessagesAvailable,
      diagnosticSentCount: sentMessagesAvailable,
    },
  )

  return {
    success: true,
    threadsProcessed,
    messagesProcessed,
    extractedKnowledgeItems,
    aiExtractedKnowledgeItems,
    fallbackKnowledgeItems,
    chunksEmbedded,
    skippedDuplicates,
    embeddingFailures,
    extractionDiagnostics,
    deleted,
    skipped: skipped + threadsFailed,
    skippedReasons,
    capped,
    labelsScanned: resolvedSelectedLabels.length,
    selectedLabels: resolvedSelectedLabels,
    labelIdsUsed,
    gmailQueryUsed: query,
    messagesFoundBeforeFiltering,
    messagesFetched: messages.length,
    threadsCreated: threadsProcessed,
    chunksCreated,
    syncFrom: metadata.syncFrom ?? null,
    configuredSyncFrom: metadata.syncFrom ?? null,
    effectiveQueryStart: afterDate?.toISOString() ?? 'all',
    lastSyncAtBeforeRun,
    lastSyncAtAfterRun,
    lastSyncAttemptAt,
    lastSuccessfulImportAt,
    namespaceUsed: personalNamespace,
    lastSyncedAt: lastSyncAttemptAt,
    importedThreads: threadsProcessed,
    importedChunks: chunksCreated,
    canReadMailbox,
    recentMessagesAvailable,
    inboxMessagesAvailable,
    sentMessagesAvailable,
    diagnosticRecentCount: recentMessagesAvailable,
    diagnosticInboxCount: inboxMessagesAvailable,
    diagnosticSentCount: sentMessagesAvailable,
    stats,
    hasMore: Boolean(cursor),
    nextPageToken: cursor,
    errorsSummary: stats.errorsSummary,
    ...(zeroMessageFallback ? { message: zeroMessageFallback } : {}),
    ...(successfulImport && extractedKnowledgeItems === 0
      ? { message: `${messagesProcessed} emails synced and searchable. No structured memory items were extracted yet.` }
      : {}),
    ...(capped && successfulImport
      ? { message: `Processed a bounded batch of ${maxMessages} emails. More emails are available; continue the backfill to resume.` }
      : {}),
  }
}
