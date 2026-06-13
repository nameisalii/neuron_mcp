import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbeddingInNamespace, deleteEmbeddingsInNamespace } from '@/lib/pinecone'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import { trackEvent } from '@/lib/activity'
import { escapeXml } from '@/lib/utils'
import { getGmailNamespace } from './config'
import type { GmailSyncMetadata, SlackMessage } from '@/types'
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
}

export interface GmailSyncResult {
  success: boolean
  threadsProcessed: number
  messagesProcessed: number
  extractedKnowledgeItems: number
  aiExtractedKnowledgeItems: number
  fallbackKnowledgeItems: number
  chunksEmbedded: number
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
    knowledgeItemCreateFailed: 0,
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
): Promise<{
  messages: ParsedEmailMessage[]
  skipped: number
  capped: boolean
  messagesFoundBeforeFiltering: number
  labelIdsUsed: string[]
  skippedReasons: Record<string, number>
}> {
  const seen = new Map<string, { id: string; threadId: string }>()
  const seenThreads = new Set<string>()
  let capped = false
  const maxMessages = Math.max(1, Math.min(metadata.maxMessages ?? MAX_MESSAGES_PER_SYNC, MAX_MESSAGES_PER_SYNC))
  let messagesFoundBeforeFiltering = 0
  const skippedReasons: Record<string, number> = {}
  const labelIdsUsed = resolveSelectedLabelIds(metadata.selectedLabels)

  for (const labelId of labelIdsUsed) {
    if (seen.size >= maxMessages) {
      capped = true
      break
    }
    const page = await listMessageIds(accessToken, {
      labelIds: [labelId],
      query,
      cap: maxMessages - seen.size,
    })
    messagesFoundBeforeFiltering += page.ids.length
    for (const ref of page.ids) seen.set(ref.id, ref)
    if (page.capped) capped = true
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
        console.error(`[gmail/sync] message ${ref.id} failed, skipping`, err)
        skipped++
        skippedReasons.message_fetch_failed = (skippedReasons.message_fetch_failed ?? 0) + 1
      }
    }
  }

  return { messages, skipped, capped, messagesFoundBeforeFiltering, labelIdsUsed, skippedReasons }
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
const SENSITIVE_AUTOMATED_SUBJECT = /\b(password reset|verification code|security code|secure verification|two[- ]step verification|one[- ]time code|login code|receipt|invoice|order confirmation)\b/i

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
  if (AUTOMATED_SENDER.test(message.from) || PROMOTIONAL_SIGNAL.test(`${subject} ${body}`) || SENSITIVE_AUTOMATED_SUBJECT.test(subject)) {
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

  const existing = await prisma.knowledgeItem.findFirst({
    where: {
      workspaceId: input.workspaceId,
      source: 'gmail',
      sourceExternalId: threadId,
      visibility: 'personal',
      visibilitySetBy: input.syncedBy,
    },
    select: { id: true },
  })
  if (existing) return 0

  const contentHash = `gmail:${input.syncedBy}:${threadId}`.slice(0, 100)
  try {
    const embedding = await generateEmbedding(boundedEmailText(content, MAX_EMAIL_EMBEDDING_CHARS))
    const dbItem = await prisma.knowledgeItem.create({
      data: {
        workspaceId: input.workspaceId,
        content,
        contentHash,
        category: 'reference',
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
    })
    try {
      await upsertEmbeddingInNamespace(
        dbItem.id,
        embedding,
        { workspaceId: input.workspaceId, category: 'reference', source: 'gmail' },
        personalNamespace,
      )
      await prisma.knowledgeItem.update({
        where: { id: dbItem.id },
        data: { embeddingId: dbItem.id },
      })
      return 1
    } catch (err) {
      await prisma.knowledgeItem.delete({ where: { id: dbItem.id } }).catch(() => null)
      diagnostics.fallbackCreateFailed++
      console.error('[gmail/sync] fallback vector upsert failed', err)
      return 0
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
  extractionDiagnostics: GmailExtractionDiagnostics
}> {
  const { workspaceId, syncedBy, metadata } = input
  const first = messages[0]
  const last = messages[messages.length - 1]
  const url = gmailThreadUrl(threadId)
  const threadLabelNames = [...new Set(messages.flatMap((m) => labelNamesFor(m, metadata)))]

  const dbThread = await prisma.emailThread.upsert({
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
  })

  // Replace stale chunks (and their personal-namespace vectors) on re-sync
  const staleChunks = await prisma.emailChunk.findMany({
    where: { emailThreadId: dbThread.id },
    select: { pineconeId: true },
  })
  const staleVectorIds = staleChunks.flatMap((c) => (c.pineconeId ? [c.pineconeId] : []))
  await deleteEmbeddingsInNamespace(staleVectorIds, personalNamespace)
  await prisma.emailChunk.deleteMany({ where: { emailThreadId: dbThread.id } })
  let deleted = staleChunks.length
  let chunksCreated = 0
  let chunksEmbedded = 0

  for (const [position, message] of messages.entries()) {
    const content = escapeXml(message.body)
    const pineconeId = `${workspaceId}-gmail-${threadId}-${position}`
    const embedding = await generateEmbedding(boundedEmailText(content, MAX_EMAIL_EMBEDDING_CHARS))
    await upsertEmbeddingInNamespace(pineconeId, embedding, { workspaceId, source: 'gmail' }, personalNamespace)
    chunksEmbedded++

    await prisma.emailChunk.create({
      data: {
        emailThreadId: dbThread.id,
        workspaceId,
        content,
        blockType: 'email_message',
        position,
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
        pineconeId,
        labels: [] as Prisma.InputJsonValue,
        labeledBy: [] as Prisma.InputJsonValue,
        // Email is private by default — only the syncing user can see it
        visibility: 'personal',
        visibilitySetBy: syncedBy,
      },
    })
    chunksCreated++
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
    extractionDiagnostics,
  }
}

export async function syncGmail(input: GmailSyncInput): Promise<GmailSyncResult> {
  const { workspaceId, syncedBy, syncedByName, metadata, lastSyncAt } = input

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
  const windowStart = configuredSyncFrom && !Number.isNaN(configuredSyncFrom.getTime())
    ? configuredSyncFrom
    : new Date(Date.now() - metadata.timeWindow * DAY_MS)
  const previousSuccessfulImportAt = metadata.lastSuccessfulImportAt
    ? new Date(metadata.lastSuccessfulImportAt)
    : null
  const validPreviousSuccessfulImportAt = previousSuccessfulImportAt
    && !Number.isNaN(previousSuccessfulImportAt.getTime())
    ? previousSuccessfulImportAt
    : null
  const afterDate = validPreviousSuccessfulImportAt && validPreviousSuccessfulImportAt > windowStart
    ? validPreviousSuccessfulImportAt
    : windowStart
  const query = buildSearchQuery(afterDate, metadata.senderFilter ?? [], metadata.excludeFilter ?? [])
  const resolvedSelectedLabels = resolveSelectedLabelIds(metadata.selectedLabels)
  const normalizedMetadata: GmailSyncMetadata = {
    ...metadata,
    selectedLabels: resolvedSelectedLabels,
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
  } = await collectMessages(accessToken, normalizedMetadata, query)
  const threads = groupByThread(messages)

  let threadsProcessed = 0
  let messagesProcessed = 0
  let threadsFailed = 0
  let aiExtractedKnowledgeItems = 0
  let fallbackKnowledgeItems = 0
  let deleted = 0
  let chunksCreated = 0
  let chunksEmbedded = 0
  const extractionDiagnostics = emptyGmailExtractionDiagnostics()

  for (const [threadId, threadMessages] of threads) {
    try {
      const result = await syncThread({ ...input, metadata: normalizedMetadata }, threadId, threadMessages, personalNamespace)
      aiExtractedKnowledgeItems += result.aiExtractedKnowledgeItems
      fallbackKnowledgeItems += result.fallbackKnowledgeItems
      deleted += result.deleted
      chunksCreated += result.chunksCreated
      chunksEmbedded += result.chunksEmbedded
      addExtractionDiagnostics(extractionDiagnostics, result.extractionDiagnostics)
      threadsProcessed++
      messagesProcessed += threadMessages.length
    } catch (err) {
      console.error(`[gmail/sync] thread ${threadId} failed, skipping`, err)
      threadsFailed++
      skippedReasons.thread_failed = (skippedReasons.thread_failed ?? 0) + 1
    }
  }

  const successfulImport = messagesProcessed > 0
  const extractedKnowledgeItems = aiExtractedKnowledgeItems + fallbackKnowledgeItems
  const lastSyncAttemptAt = syncAttemptAt.toISOString()
  const lastSuccessfulImportAt = successfulImport
    ? lastSyncAttemptAt
    : metadata.lastSuccessfulImportAt ?? null
  const lastSyncAtAfterRun = lastSyncAttemptAt

  await prisma.integration.update({
    where: { workspaceId_type: { workspaceId, type: 'gmail' } },
    data: {
      lastSyncAt: syncAttemptAt,
      metadata: {
        ...normalizedMetadata,
        lastSyncAttemptAt,
        ...(lastSuccessfulImportAt ? { lastSuccessfulImportAt } : {}),
      } as Prisma.InputJsonValue,
    },
  })

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
      effectiveQueryStart: afterDate.toISOString(),
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
    effectiveQueryStart: afterDate.toISOString(),
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
    ...(zeroMessageFallback ? { message: zeroMessageFallback } : {}),
    ...(successfulImport && extractedKnowledgeItems === 0
      ? { message: `${messagesProcessed} emails synced and searchable. No structured memory items were extracted yet.` }
      : {}),
    ...(capped && successfulImport
      ? { message: `Synced the ${metadata.maxMessages ?? MAX_MESSAGES_PER_SYNC} most recent emails — more emails match your filters. Narrow the time window or sender filter to capture the rest.` }
      : {}),
  }
}
