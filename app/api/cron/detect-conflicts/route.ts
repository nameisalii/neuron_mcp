import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { detectConflicts } from '@/lib/alerts/conflict-detector'

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

    const since = new Date(Date.now() - 10 * 60 * 1000)
    const recentChunks = await prisma.notionChunk.findMany({
      where: { updatedAt: { gte: since } },
      select: { id: true, workspaceId: true },
    })

    let conflictsFound = 0

    for (const chunk of recentChunks) {
      try {
        const before = await prisma.alert.count({ where: { workspaceId: chunk.workspaceId, type: 'conflict' } })
        await detectConflicts(chunk.workspaceId, chunk.id)
        const after = await prisma.alert.count({ where: { workspaceId: chunk.workspaceId, type: 'conflict' } })
        conflictsFound += after - before
      } catch (err) {
        console.error(`[cron/detect-conflicts] chunk ${chunk.id} failed:`, err)
      }
    }

    return NextResponse.json({ checked: recentChunks.length, conflictsFound })
  } catch (err) {
    console.error('[cron/detect-conflicts]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
