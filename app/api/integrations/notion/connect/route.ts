import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Notion currently uses the server-managed integration token. Keep the UI
  // pointed at a stable connect route while the existing sync route provisions
  // the workspace integration and imports pages shared with Neuron.
  return NextResponse.redirect(new URL('/api/integrations/notion/sync', req.url), 307)
}
