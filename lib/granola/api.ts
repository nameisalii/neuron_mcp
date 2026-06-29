import { z } from 'zod'

// Granola public REST API. Docs: https://docs.granola.ai/introduction
// Auth: `Authorization: Bearer grn_...`. Read-only access to the caller's notes.
const GRANOLA_API_BASE = 'https://public-api.granola.ai/v1'

// Rate limits are ~5 req/s sustained; we throttle detail fetches and back off on 429.
const MAX_RETRIES = 3

export class GranolaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'GranolaApiError'
  }
}

// Transcript segments and attendees are parsed defensively — the public API is
// young and field presence varies by note. We only depend on `id`.
const transcriptSegmentSchema = z
  .object({
    speaker: z.string().nullish(),
    text: z.string().nullish(),
  })
  .passthrough()

const attendeeSchema = z
  .object({
    name: z.string().nullish(),
    email: z.string().nullish(),
  })
  .passthrough()

const noteSchema = z
  .object({
    id: z.string(),
    title: z.string().nullish(),
    summary: z.string().nullish(),
    created_at: z.string().nullish(),
    url: z.string().nullish(),
    owner: z.object({ name: z.string().nullish(), email: z.string().nullish() }).nullish(),
    attendees: z.array(attendeeSchema).nullish(),
    action_items: z.array(z.string()).nullish(),
    transcript: z.array(transcriptSegmentSchema).nullish(),
  })
  .passthrough()

export type GranolaNote = z.infer<typeof noteSchema>

const listResponseSchema = z
  .object({
    // The list endpoint has returned the array under different keys across
    // versions — accept the common ones.
    notes: z.array(noteSchema).nullish(),
    data: z.array(noteSchema).nullish(),
    results: z.array(noteSchema).nullish(),
    cursor: z.string().nullish(),
    next_cursor: z.string().nullish(),
    has_more: z.boolean().nullish(),
    hasMore: z.boolean().nullish(),
  })
  .passthrough()

export interface GranolaNotePage {
  notes: GranolaNote[]
  nextCursor: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function granolaFetch(token: string, path: string): Promise<unknown> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${GRANOLA_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    if (res.status === 429) {
      if (attempt === MAX_RETRIES) throw new GranolaApiError('Granola rate limit exceeded', 429)
      const retryAfter = Number(res.headers.get('retry-after')) || attempt
      await sleep(retryAfter * 1000)
      continue
    }

    if (res.status === 401 || res.status === 403) {
      throw new GranolaApiError('Granola API key is invalid or lacks access', res.status)
    }

    if (!res.ok) {
      throw new GranolaApiError(`Granola API request failed (${res.status})`, res.status)
    }

    return res.json()
  }
  throw new GranolaApiError('Granola API request failed', 500)
}

/** Fetch one page of notes. `createdAfter` is an ISO date for incremental sync. */
export async function listNotes(
  token: string,
  options: { createdAfter?: string | null; cursor?: string | null } = {},
): Promise<GranolaNotePage> {
  const params = new URLSearchParams()
  if (options.createdAfter) params.set('created_after', options.createdAfter)
  if (options.cursor) params.set('cursor', options.cursor)
  const query = params.toString()

  const json = await granolaFetch(token, `/notes${query ? `?${query}` : ''}`)
  const parsed = listResponseSchema.parse(json)
  const notes = parsed.notes ?? parsed.data ?? parsed.results ?? []
  const hasMore = parsed.has_more ?? parsed.hasMore ?? false
  const cursor = parsed.cursor ?? parsed.next_cursor ?? null
  return { notes, nextCursor: hasMore ? cursor : null }
}

/** Fetch a single note including its transcript (when one exists). */
export async function getNote(token: string, noteId: string): Promise<GranolaNote> {
  const json = await granolaFetch(token, `/notes/${encodeURIComponent(noteId)}?include=transcript`)
  return noteSchema.parse(json)
}

/** Lightweight validation call used at connect time to confirm the key works. */
export async function verifyToken(token: string): Promise<boolean> {
  await listNotes(token, {})
  return true
}
