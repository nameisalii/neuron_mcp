import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import { listNotes, getNote, type GranolaNote } from '@/lib/granola/api'
import type { SlackMessage } from '@/types'

// Bound first-sync cost/time. Idempotency makes repeated syncs cheap anyway.
const MAX_NOTES_PER_RUN = 200
// Stay well under Granola's ~5 req/s sustained limit when fetching note details.
const DETAIL_THROTTLE_MS = 250
const MAX_TRANSCRIPT_CHARS = 8000

export interface GranolaSyncResult {
  success: boolean
  fetched: number
  processed: number
  knowledgeCreated: number
  knowledgeUpdated: number
  skipped: number
  skippedReasons: Record<string, number>
  extractionErrors: number
  embeddingErrors: number
  databaseErrors: number
  message?: string
}

interface GranolaSyncParams {
  workspaceId: string
  token: string
  syncedBy: string
  syncedByName: string
  lastSyncAt: Date | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function incrementReason(target: Record<string, number>, reason: string): void {
  target[reason] = (target[reason] ?? 0) + 1
}

function attendeeNames(note: GranolaNote): string {
  const names = (note.attendees ?? [])
    .map((attendee) => attendee.name ?? attendee.email ?? '')
    .filter(Boolean)
  return names.join(', ')
}

function transcriptText(note: GranolaNote): string {
  if (!note.transcript?.length) return ''
  return note.transcript
    .map((segment) => {
      const speaker = segment.speaker ? `${segment.speaker}: ` : ''
      return `${speaker}${segment.text ?? ''}`.trim()
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TRANSCRIPT_CHARS)
}

/**
 * Compose a single message that carries the full note context. The extraction
 * pipeline turns this into structured KnowledgeItems, or a "note" fallback item
 * so a useful meeting note is never dropped.
 */
function noteToMessages(note: GranolaNote): SlackMessage[] {
  const title = note.title?.trim() || 'Untitled meeting'
  const parts: string[] = [title]

  const attendees = attendeeNames(note)
  if (attendees) parts.push(`Attendees: ${attendees}`)
  if (note.summary?.trim()) parts.push(`Summary:\n${note.summary.trim()}`)
  if (note.action_items?.length) {
    parts.push(`Action items:\n${note.action_items.map((item) => `- ${item}`).join('\n')}`)
  }
  const transcript = transcriptText(note)
  if (transcript) parts.push(`Transcript:\n${transcript}`)

  const ts = note.created_at ? String(new Date(note.created_at).getTime() / 1000) : ''
  return [
    {
      text: parts.join('\n\n'),
      user: note.owner?.name ?? 'Granola',
      channel: title,
      ts,
      permalink: note.url ?? undefined,
    },
  ]
}

function extractionErrorCount(diagnostics: ExtractionDiagnostics): number {
  return (
    diagnostics.extractorParseFailed +
    diagnostics.validationFailed +
    diagnostics.itemProcessingFailed
  )
}

export async function syncGranola(params: GranolaSyncParams): Promise<GranolaSyncResult> {
  const { workspaceId, token, syncedBy, syncedByName, lastSyncAt } = params

  let fetched = 0
  let processed = 0
  let knowledgeCreated = 0
  const knowledgeUpdated = 0
  let skipped = 0
  let extractionErrors = 0
  let embeddingErrors = 0
  let databaseErrors = 0
  const skippedReasons: Record<string, number> = {}

  let cursor: string | null = null
  const createdAfter = lastSyncAt ? lastSyncAt.toISOString() : null

  outer: do {
    const page = await listNotes(token, { createdAfter, cursor })
    cursor = page.nextCursor

    for (const summaryNote of page.notes) {
      fetched++
      if (processed >= MAX_NOTES_PER_RUN) break outer

      // Idempotency: skip notes we already imported before spending any API or
      // extraction budget on them.
      const existing = await prisma.knowledgeItem.count({
        where: { workspaceId, source: 'granola', sourceExternalId: summaryNote.id },
      })
      if (existing > 0) {
        skipped++
        incrementReason(skippedReasons, 'already_synced')
        continue
      }

      // Enrich with transcript/attendees; fall back to the list payload if the
      // detail call fails so the note is still imported.
      let note = summaryNote
      try {
        await sleep(DETAIL_THROTTLE_MS)
        note = await getNote(token, summaryNote.id)
      } catch {
        // Non-fatal: detail enrichment failed, continue with list data only.
        incrementReason(skippedReasons, 'detail_fetch_failed')
      }

      try {
        const result = await extractKnowledgeDetailed(
          noteToMessages(note),
          workspaceId,
          'granola',
          note.url ?? undefined,
          note.id,
        )
        knowledgeCreated += result.items.length
        extractionErrors += extractionErrorCount(result.diagnostics)
        embeddingErrors += result.diagnostics.embeddingUpsertFailed
        databaseErrors += result.diagnostics.knowledgeItemCreateFailed
        if (result.items.length === 0) {
          skipped++
          incrementReason(skippedReasons, 'no_extractable_knowledge')
        }
        processed++
      } catch {
        // Never log raw note content — count the failure only.
        databaseErrors++
        incrementReason(skippedReasons, 'note_failed')
      }
    }
  } while (cursor)

  await trackEvent(workspaceId, syncedBy, syncedByName, 'sync',
    `Synced ${processed} notes from Granola`,
    { integration: 'granola', action: 'completed', processed, knowledgeCreated, skipped })

  // Counts only — no token, no note content, no transcript text, no attendee PII.
  console.info('[granola/sync] summary', {
    workspaceId,
    integration: 'granola',
    fetched,
    processed,
    knowledgeCreated,
    knowledgeUpdated,
    skipped,
    skippedReasons,
    extractionErrors,
    embeddingErrors,
    databaseErrors,
  })

  const message = processed === 0
    ? fetched === 0
      ? 'No Granola notes found. Only notes with a generated summary are available via the API.'
      : 'All Granola notes are already synced.'
    : undefined

  return {
    success: true,
    fetched,
    processed,
    knowledgeCreated,
    knowledgeUpdated,
    skipped,
    skippedReasons,
    extractionErrors,
    embeddingErrors,
    databaseErrors,
    message,
  }
}
