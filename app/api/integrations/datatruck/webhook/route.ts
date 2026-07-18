import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { DATATRUCK_ENDPOINT_LABELS, type DatatruckEndpointKey } from '@/lib/datatruck/client'
import { genericDatatruckRecordNormalizer } from '@/lib/datatruck/normalize'
import { upsertKnowledgeItem } from '@/lib/datatruck/sync'

export const runtime = 'nodejs'

// Foundation only: Datatruck has no confirmed public webhook product yet.
// This route stays inactive (404) until DATATRUCK_WEBHOOK_SECRET is set,
// and nothing in the UI claims webhook support is live.

const MAX_PAYLOAD_BYTES = 1024 * 1024 // 1 MB
const REPLAY_TOLERANCE_MS = 5 * 60 * 1000

const WebhookSchema = z.object({
  workspaceId: z.string().trim().min(1),
  module: z.string().trim().min(1),
  eventType: z.string().trim().min(1).max(100),
  recordId: z.string().trim().max(200).optional(),
  sentAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()),
})

function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedHash, expectedHash)
}

function isDatatruckModule(value: string): value is DatatruckEndpointKey {
  return Object.prototype.hasOwnProperty.call(DATATRUCK_ENDPOINT_LABELS, value)
}

export async function POST(req: Request) {
  try {
    const configuredSecret = process.env.DATATRUCK_WEBHOOK_SECRET
    if (!configuredSecret) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const providedSecret = req.headers.get('x-neuron-webhook-secret')
    if (!providedSecret || !secretsMatch(providedSecret, configuredSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await req.text()
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = WebhookSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })

    const { workspaceId, module, eventType, sentAt, payload } = parsed.data
    if (!isDatatruckModule(module)) {
      return NextResponse.json({ error: 'Unknown Datatruck module' }, { status: 400 })
    }

    if (sentAt && Math.abs(Date.now() - new Date(sentAt).getTime()) > REPLAY_TOLERANCE_MS) {
      return NextResponse.json({ error: 'Event timestamp is outside the accepted window' }, { status: 400 })
    }

    const connector = await prisma.apiConnector.findUnique({
      where: { workspaceId_sourceKey: { workspaceId, sourceKey: 'datatruck' } },
      select: { id: true },
    })
    if (!connector) return NextResponse.json({ error: 'No Datatruck connector for this workspace' }, { status: 404 })

    const item = genericDatatruckRecordNormalizer(module, payload)
    const counters = { created: 0, updated: 0, skipped: 0, embeddingErrors: 0 }
    await upsertKnowledgeItem({ workspaceId, endpointKey: module, item, counters })

    return NextResponse.json({
      success: true,
      eventType,
      module,
      created: counters.created,
      updated: counters.updated,
      skipped: counters.skipped,
    })
  } catch (err) {
    console.error('[datatruck/webhook]', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
