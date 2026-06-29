import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getTelegramConfig } from '@/lib/telegram/config'
import { processTelegramUpdate } from '@/lib/telegram/webhook'

function equalSecret(actual: string | null, expected: string): boolean {
  if (!actual) return false
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export async function POST(req: Request) {
  const { webhookSecret } = getTelegramConfig()
  if (webhookSecret && !equalSecret(req.headers.get('x-telegram-bot-api-secret-token'), webhookSecret)) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = await processTelegramUpdate(payload)
  console.info('[telegram/webhook] summary', {
    workspaceId: result.workspaceId,
    integrationId: result.integrationId,
    chatIdHash: result.chatIdHash,
    messagesReceived: result.messagesReceived,
    messagesProcessed: result.messagesProcessed,
    knowledgeCreated: result.knowledgeCreated,
    knowledgeUpdated: result.knowledgeUpdated,
    skippedReasons: result.skippedReasons,
    extractionErrors: result.extractionErrors,
    embeddingErrors: result.embeddingErrors,
    databaseErrors: result.databaseErrors,
  })
  return NextResponse.json({ success: true, ...result })
}
