import { NextRequest, NextResponse } from 'next/server'
import { getTeamsConfig } from '@/lib/teams/config'

function validationResponse(token: string): Response {
  return new Response(token, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('validationToken')
  if (token) return validationResponse(token)
  return NextResponse.json({
    success: true,
    message: 'Microsoft Teams webhook endpoint is available. Teams v1 uses manual/recent sync unless Graph subscriptions are configured.',
  })
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('validationToken')
  if (token) return validationResponse(token)

  const { webhookClientState } = getTeamsConfig()
  let payload: { value?: Array<{ clientState?: string }> } = {}
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (webhookClientState) {
    const valid = (payload.value ?? []).every((notification) => notification.clientState === webhookClientState)
    if (!valid) return NextResponse.json({ error: 'Invalid client state' }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    received: payload.value?.length ?? 0,
    message: 'Teams change notification received. Manual/recent sync is used for message ingestion in v1.',
  })
}
