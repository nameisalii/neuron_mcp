import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { detectStaleChunks } from '@/lib/alerts/stale-detector'

function validateCronSecret(incoming: string): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  try {
    const a = Buffer.from(incoming)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch { return false }
}

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret') ?? ''
    if (!validateCronSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const workspaces = await prisma.syncStatus.findMany({
      where: { integration: 'notion', status: 'active' },
      select: { workspaceId: true },
    })

    let totalAlerts = 0

    for (const { workspaceId } of workspaces) {
      try {
        const count = await detectStaleChunks(workspaceId)
        totalAlerts += count
      } catch (err) {
        console.error(`[cron/detect-stale] workspace ${workspaceId} failed:`, err)
      }
    }

    return NextResponse.json({ workspacesChecked: workspaces.length, alertsCreated: totalAlerts })
  } catch (err) {
    console.error('[cron/detect-stale]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
