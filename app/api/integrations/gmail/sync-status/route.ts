import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { GmailSyncMetadata } from '@/types'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId: user.workspace.id, type: 'gmail' } },
    select: { lastSyncAt: true, metadata: true },
  })
  if (!integration) return NextResponse.json({ error: 'Gmail is not connected' }, { status: 404 })
  const metadata = integration.metadata as GmailSyncMetadata | null
  return NextResponse.json({
    lastSyncAt: integration.lastSyncAt,
    lastSuccessfulImportAt: metadata?.lastSuccessfulImportAt ?? null,
    status: metadata?.lastSyncStatus ?? null,
    stats: metadata?.lastSyncStats ?? null,
    backfillStatus: metadata?.backfillStatus ?? null,
    hasMore: Boolean(metadata?.backfillCursor),
  })
}
