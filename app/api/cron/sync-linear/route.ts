import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runLinearBackgroundSync } from '@/lib/linear/background'

export const maxDuration = 120

function validSecret(value: string): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const a = Buffer.from(value)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  if (!validSecret(req.headers.get('x-cron-secret') ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const statuses = await prisma.syncStatus.findMany({
    where: {
      integration: 'linear',
      mode: 'background',
      status: 'active',
      OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: new Date() } }],
    },
    select: { id: true, workspaceId: true },
  })
  let processed = 0
  for (const status of statuses) {
    try {
      await runLinearBackgroundSync(status.workspaceId)
      processed++
    } catch (err) {
      console.error(`[cron/sync-linear] workspace ${status.workspaceId} failed`, err)
      await prisma.syncStatus.update({
        where: { id: status.id },
        data: { status: 'error', errorMessage: err instanceof Error ? err.message : 'Unknown error' },
      })
    }
  }
  return NextResponse.json({ processed, total: statuses.length })
}
