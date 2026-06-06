import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runNotionBackgroundSync } from '@/lib/sync/background'

function validateCronSecret(incoming: string): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  try {
    const a = Buffer.from(incoming)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret') ?? ''
    if (!validateCronSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const syncStatuses = await prisma.syncStatus.findMany({
      where: { integration: 'notion', mode: 'background', status: 'active' },
      select: { id: true, workspaceId: true },
    })

    let processed = 0

    for (const syncStatus of syncStatuses) {
      try {
        await runNotionBackgroundSync(syncStatus.workspaceId)
        processed++
      } catch (err) {
        console.error(`[cron/sync-notion] workspace ${syncStatus.workspaceId} failed:`, err)
        await prisma.syncStatus.update({
          where: { id: syncStatus.id },
          data: {
            status: 'error',
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
          },
        })
      }
    }

    return NextResponse.json({ processed, total: syncStatuses.length })
  } catch (err) {
    console.error('[cron/sync-notion]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
