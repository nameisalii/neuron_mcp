import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { getGmailRedirectUri, getGmailClientId, getGmailScopes, GMAIL_SCOPES, safeGoogleOAuthDebug, getGmailAppUrl } from '@/lib/gmail/config'
import { isGmailConnectAllowed, isGmailIntegrationEnabled } from '@/lib/gmail/access'

function gmailRedirect(params: Record<string, string>): NextResponse {
  const url = new URL('/dashboard/integrations', getGmailAppUrl())
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isGmailIntegrationEnabled()) {
    return gmailRedirect({ error: 'gmail_failed', reason: 'integration_disabled' })
  }

  // Public mode permits every signed-in user. While restricted-scope verification is
  // pending, only the explicit Gmail test-user allowlist may start OAuth.
  const account = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { email: true },
  })
  if (!isGmailConnectAllowed(account?.email)) {
    return gmailRedirect({ error: 'gmail_failed', reason: 'verification_pending' })
  }

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

  safeGoogleOAuthDebug({ flow: 'gmail', clientId, redirectUri: getGmailRedirectUri(), scopes: GMAIL_SCOPES })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
