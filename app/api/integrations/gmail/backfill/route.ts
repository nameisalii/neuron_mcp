import { NextResponse } from 'next/server'
import { isGmailBackfillEnabled } from '@/lib/gmail/config'
import { handleGmailSync } from '../sync/route'

export async function POST(request: Request) {
  if (!isGmailBackfillEnabled()) {
    return NextResponse.json({ error: 'Gmail backfill is disabled' }, { status: 404 })
  }
  return handleGmailSync(request, 'backfill')
}
