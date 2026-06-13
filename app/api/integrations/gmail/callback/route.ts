import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { DEFAULT_GMAIL_LABEL_NAMES, DEFAULT_GMAIL_LABELS } from '@/lib/gmail/config'
import { trackEvent } from '@/lib/activity'
import { getGmailClientId, getGmailClientSecret, getGmailRedirectUri, getGmailAppUrl } from '@/lib/gmail/config'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

function gmailRedirect(params: Record<string, string>): NextResponse {
  const url = new URL('/dashboard/integrations', getGmailAppUrl())
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return gmailRedirect({ error: 'gmail_failed', reason: 'unauthorized' })

  const cookieStore = await cookies()
  const savedState = cookieStore.get('gmail_oauth_state')?.value
  const returnedState = req.nextUrl.searchParams.get('state')
  const code = req.nextUrl.searchParams.get('code')
  cookieStore.delete('gmail_oauth_state')

  if (!savedState) return gmailRedirect({ error: 'gmail_failed', reason: 'state_expired' })
  if (!returnedState || returnedState !== savedState) {
    return gmailRedirect({ error: 'gmail_failed', reason: 'invalid_state' })
  }
  if (!code) return gmailRedirect({ error: 'gmail_failed', reason: 'missing_code' })

  const embeddedUserId = savedState.split('.')[1]
  if (!embeddedUserId || embeddedUserId !== userId) {
    return gmailRedirect({ error: 'gmail_failed', reason: 'state_user_mismatch' })
  }

  let clientId: string
  let clientSecret: string
  try {
    clientId = getGmailClientId()
    clientSecret = getGmailClientSecret()
  } catch {
    return gmailRedirect({ error: 'gmail_failed', reason: 'misconfigured' })
  }

  let tokenData: { access_token?: string; refresh_token?: string } | null = null
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getGmailRedirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    })
    if (!tokenRes.ok) {
      return gmailRedirect({ error: 'gmail_failed', reason: `token_exchange_${tokenRes.status}` })
    }
    tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string }
  } catch {
    return gmailRedirect({ error: 'gmail_failed', reason: 'token_exchange_failed' })
  }

  if (!tokenData?.refresh_token) {
    return gmailRedirect({ error: 'gmail_failed', reason: 'missing_refresh_token' })
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return gmailRedirect({ error: 'gmail_failed', reason: 'no_workspace' })

  const workspaceId = user.workspace.id
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, displayName: true, status: true },
  })
  if (!member || !ALLOWED_ROLES.has(member.role) || member.status !== 'active') {
    return gmailRedirect({ error: 'gmail_failed', reason: 'forbidden' })
  }

  const encryptedRefreshToken = encrypt(tokenData.refresh_token)
  const metadata = {
    status: 'connected',
    configured: false,
    privacy: 'personal',
    selectedLabels: [...DEFAULT_GMAIL_LABELS],
    selectedLabelNames: [...DEFAULT_GMAIL_LABEL_NAMES],
    timeWindow: 30,
    syncFrom: null,
    senderFilter: [],
    excludeFilter: [],
    maxMessages: 200,
  }

  try {
    await prisma.integration.upsert({
      where: { workspaceId_type: { workspaceId, type: 'gmail' } },
      create: {
        workspaceId,
        type: 'gmail',
        accessToken: encryptedRefreshToken,
        channels: [],
        metadata,
        teamId: null,
        teamName: null,
        lastSyncAt: null,
      },
      update: {
        accessToken: encryptedRefreshToken,
        channels: [],
        metadata,
        teamId: null,
        teamName: null,
        lastSyncAt: null,
      },
    })

    await prisma.syncStatus.upsert({
      where: { workspaceId_integration: { workspaceId, integration: 'gmail' } },
      create: {
        workspaceId,
        integration: 'gmail',
        mode: 'background',
        status: 'paused',
        configuredBy: userId,
        errorMessage: null,
        nextSyncAt: null,
      },
      update: {
        mode: 'background',
        status: 'paused',
        configuredBy: userId,
        errorMessage: null,
        nextSyncAt: null,
      },
    })

    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Gmail connected', {
      integration: 'gmail',
      action: 'connected',
      privacy: 'personal',
    })
  } catch (err) {
    console.error('[gmail/callback] DB write error', err)
    return gmailRedirect({ error: 'gmail_failed', reason: 'db_error' })
  }

  return gmailRedirect({ connected: 'gmail' })
}
