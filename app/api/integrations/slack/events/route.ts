import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { processSlackMessage } from '@/lib/sync/background'

function verifySlackSignature(rawBody: string, timestamp: string, sig: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) return false
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

interface SlackEventPayload {
  type: string
  challenge?: string
  team_id?: string
  event?: {
    type: string
    subtype?: string
    channel: string
    user: string
    text: string
    ts: string
  }
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const timestamp = req.headers.get('x-slack-request-timestamp') ?? ''
    const signature = req.headers.get('x-slack-signature') ?? ''

    if (!verifySlackSignature(rawBody, timestamp, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let payload: SlackEventPayload
    try {
      payload = JSON.parse(rawBody) as SlackEventPayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (payload.type === 'url_verification') {
      return NextResponse.json({ challenge: payload.challenge })
    }

    if (payload.type === 'event_callback' && payload.event?.type === 'message' && !payload.event.subtype) {
      const teamId = payload.team_id
      if (teamId) {
        const integration = await prisma.integration.findFirst({
          where: { type: 'slack', teamId },
          select: { workspaceId: true },
        })
        if (integration) {
          void processSlackMessage(integration.workspaceId, payload.event)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[slack/events]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
