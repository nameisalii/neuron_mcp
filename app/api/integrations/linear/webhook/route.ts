import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteLinearIssue, syncLinearIssueById } from '@/lib/linear/sync'
import { trackEvent } from '@/lib/activity'

export const maxDuration = 60

interface LinearWebhook {
  action?: string
  type?: string
  organizationId?: string
  data?: {
    id?: string
    url?: string
    archivedAt?: string | null
    issue?: { id?: string }
  }
}

function validSignature(body: string, signature: string): boolean {
  const secret = process.env.LINEAR_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (!validSignature(rawBody, req.headers.get('linear-signature') ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let event: LinearWebhook
  try {
    event = JSON.parse(rawBody) as LinearWebhook
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const integration = event.organizationId
    ? await prisma.integration.findFirst({ where: { type: 'linear', teamId: event.organizationId } })
    : null
  if (!integration) return NextResponse.json({ accepted: true, processed: false }, { status: 202 })

  const issueId = event.type === 'Issue' ? event.data?.id : event.data?.issue?.id
  if (!issueId) {
    // Project changes are picked up by incremental background sync.
    await prisma.syncStatus.updateMany({
      where: { workspaceId: integration.workspaceId, integration: 'linear' },
      data: { nextSyncAt: new Date() },
    })
    return NextResponse.json({ accepted: true, processed: false })
  }

  const isDelete = event.action === 'remove' || event.action === 'delete' || Boolean(event.data?.archivedAt)
  const result = isDelete
    ? { deleted: await deleteLinearIssue(integration.workspaceId, issueId, event.data?.url) }
    : await syncLinearIssueById({
        id: integration.id,
        workspaceId: integration.workspaceId,
        accessToken: integration.accessToken,
        lastSyncAt: integration.lastSyncAt,
        metadata: integration.metadata as Record<string, unknown> | null,
      }, issueId)

  await trackEvent(integration.workspaceId, 'system', 'Linear webhook', 'sync', `Linear webhook ${event.action ?? 'update'} processed`, {
    integration: 'linear',
    action: event.action ?? 'update',
    type: event.type,
    issueId,
    ...result,
  })
  return NextResponse.json({ accepted: true, processed: true, result })
}
