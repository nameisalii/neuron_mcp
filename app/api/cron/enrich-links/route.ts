import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runLinkEnrichment } from '@/lib/enrich/job'

export const maxDuration = 300

function validSecret(value: string): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const provided = Buffer.from(value)
  const configured = Buffer.from(expected)
  return provided.length === configured.length && timingSafeEqual(provided, configured)
}

export async function GET(req: Request) {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!validSecret(req.headers.get('x-cron-secret') ?? bearer)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await runLinkEnrichment())
  } catch {
    console.error('[cron/enrich-links] failed', { errorCode: 'LINK_ENRICHMENT_RUN_FAILED' })
    return NextResponse.json({ error: 'Link enrichment failed' }, { status: 500 })
  }
}
