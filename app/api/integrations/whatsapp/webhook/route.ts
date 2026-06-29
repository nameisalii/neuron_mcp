import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import { parseWhatsAppWebhookPayload, toSlackMessage } from '@/lib/whatsapp/webhook'
import { trackEvent } from '@/lib/activity'

function timingSafeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  if (aBuffer.length !== bBuffer.length) return false
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

function validSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) return true
  if (!signature?.startsWith('sha256=')) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
  return timingSafeEqual(signature, expected)
}

function extractionErrorCount(diagnostics: ExtractionDiagnostics): number {
  return diagnostics.extractorParseFailed + diagnostics.validationFailed + diagnostics.itemProcessingFailed
}

export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new NextResponse(null, { status: 403 })
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (!validSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messages = parseWhatsAppWebhookPayload(payload)
  if (messages.length === 0) {
    return NextResponse.json({ success: true, received: 0, processed: 0 })
  }

  let processed = 0
  let knowledgeCreated = 0
  let skipped = 0
  let extractionErrors = 0
  let embeddingErrors = 0
  let databaseErrors = 0

  for (const message of messages) {
    const integration = await prisma.integration.findFirst({
      where: { type: 'whatsapp', teamId: message.phoneNumberId },
      select: { id: true, workspaceId: true },
    })
    if (!integration) {
      skipped++
      continue
    }

    const existing = await prisma.knowledgeItem.count({
      where: { workspaceId: integration.workspaceId, source: 'whatsapp', sourceExternalId: message.id },
    })
    if (existing > 0) {
      skipped++
      continue
    }

    try {
      const result = await extractKnowledgeDetailed(
        [toSlackMessage(message)],
        integration.workspaceId,
        'whatsapp',
        `https://wa.me/${message.from}`,
        message.id,
      )
      knowledgeCreated += result.items.length
      extractionErrors += extractionErrorCount(result.diagnostics)
      embeddingErrors += result.diagnostics.embeddingUpsertFailed
      databaseErrors += result.diagnostics.knowledgeItemCreateFailed
      processed++

      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      })
    } catch {
      databaseErrors++
    }
  }

  if (processed > 0) {
    const affectedWorkspaceIds = [...new Set(messages.map((message) => message.phoneNumberId))]
    console.info('[whatsapp/webhook] processed', {
      phoneNumberIds: affectedWorkspaceIds,
      received: messages.length,
      processed,
      knowledgeCreated,
      skipped,
      extractionErrors,
      embeddingErrors,
      databaseErrors,
    })
  }

  await Promise.allSettled(
    messages.map(async (message) => {
      const integration = await prisma.integration.findFirst({
        where: { type: 'whatsapp', teamId: message.phoneNumberId },
        select: { workspaceId: true },
      })
      if (!integration) return
      await trackEvent(integration.workspaceId, 'system', 'WhatsApp Business', 'sync', 'WhatsApp webhook message imported', {
        integration: 'whatsapp',
        action: 'webhook',
        messageId: message.id,
      })
    }),
  )

  return NextResponse.json({
    success: true,
    received: messages.length,
    processed,
    knowledgeCreated,
    skipped,
    extractionErrors,
    embeddingErrors,
    databaseErrors,
  })
}
