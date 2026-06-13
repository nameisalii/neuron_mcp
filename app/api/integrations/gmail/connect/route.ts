import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { getGmailRedirectUri, getGmailClientId, getGmailScopes } from '@/lib/gmail/config'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let clientId: string
  try {
    clientId = getGmailClientId()
  } catch {
    return NextResponse.json({ error: 'Gmail integration is not configured' }, { status: 500 })
  }

  const stateToken = randomBytes(16).toString('hex')
  const state = `${stateToken}.${userId}`
  const cookieStore = await cookies()
  cookieStore.set('gmail_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGmailRedirectUri(),
    response_type: 'code',
    scope: getGmailScopes(),
    access_type: 'offline',
    prompt: 'consent', // force consent so Google always returns a refresh token
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
