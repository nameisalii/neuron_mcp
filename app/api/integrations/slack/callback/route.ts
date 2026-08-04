import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { redirect } from 'next/navigation'
import type { SlackOAuthToken } from '@/types'
import { friendlySlackOAuthError, getSlackRedirectUri, parseSlackMode, type SlackConnectionMode } from '@/lib/slack/oauth'

function slackFailureUrl(error: string | undefined): string {
  const failure = friendlySlackOAuthError(error)
  const errorKey = failure.distributionRequired
    ? 'slack_distribution_required'
    : failure.adminApproval ? 'slack_admin_approval' : 'slack_failed'
  return `/dashboard/integrations?error=${errorKey}&reason=${encodeURIComponent(failure.reason)}`
}

export async function GET(req: Request) {
  const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID
  const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const oauthError = searchParams.get('error')

  if (oauthError) {
    redirect(slackFailureUrl(oauthError))
  }
  if (!code || !stateParam) redirect('/dashboard?error=slack_failed')

  // Verify CSRF state against the httpOnly cookie
  const cookieStore = await cookies()
  const rawCookie = cookieStore.get('slack_oauth_state')?.value
  cookieStore.delete('slack_oauth_state')

  if (!rawCookie) redirect('/dashboard?error=slack_failed')

  let cookieState: { state: string; userId: string; mode?: SlackConnectionMode }
  try {
    cookieState = JSON.parse(rawCookie) as { state: string; userId: string; mode?: SlackConnectionMode }
  } catch {
    redirect('/dashboard?error=slack_failed')
  }

  if (stateParam !== cookieState.state) redirect('/dashboard?error=slack_failed')

  // Verify the Clerk session belongs to the user who initiated the flow
  const { userId: sessionUserId } = await auth()
  if (!sessionUserId || sessionUserId !== cookieState.userId) {
    redirect('/dashboard?error=slack_failed')
  }

  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
    redirect('/dashboard?error=slack_failed')
  }

  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      redirect_uri: getSlackRedirectUri(),
    }),
  })

  const token = (await tokenRes.json()) as SlackOAuthToken

  if (!token.ok) {
    redirect(slackFailureUrl(token.error))
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: cookieState.userId },
    include: { workspace: true },
  })

  if (!user?.workspace) redirect('/dashboard?error=no_workspace')

  const mode = parseSlackMode(cookieState.mode)
  if (mode === 'user') {
    const userToken = token.authed_user?.access_token
    const slackUserId = token.authed_user?.id
    const teamId = token.team?.id
    if (!userToken || !slackUserId || !teamId) {
      redirect('/dashboard/integrations?error=slack_failed&reason=missing_user_token')
    }
    let externalUserName: string | null = null
    try {
      const profileResponse = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
        headers: { Authorization: `Bearer ${userToken}` },
        cache: 'no-store',
      })
      const profile = await profileResponse.json() as {
        ok?: boolean
        user?: { real_name?: string; name?: string }
      }
      externalUserName = profile.ok ? profile.user?.real_name ?? profile.user?.name ?? null : null
    } catch {
      externalUserName = null
    }
    const expiresIn = token.authed_user?.expires_in
    await prisma.slackUserConnection.upsert({
      where: {
        workspaceId_connectedByUserId: {
          workspaceId: user.workspace.id,
          connectedByUserId: cookieState.userId,
        },
      },
      update: {
        encryptedAccessToken: encrypt(userToken),
        encryptedRefreshToken: token.authed_user?.refresh_token ? encrypt(token.authed_user.refresh_token) : null,
        teamId,
        teamName: token.team?.name,
        externalUserId: slackUserId,
        externalUserName,
        scopes: (token.authed_user?.scope ?? '').split(',').filter(Boolean),
        tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        installedAt: new Date(),
        lastErrorCode: null,
      },
      create: {
        workspaceId: user.workspace.id,
        connectedByUserId: cookieState.userId,
        encryptedAccessToken: encrypt(userToken),
        encryptedRefreshToken: token.authed_user?.refresh_token ? encrypt(token.authed_user.refresh_token) : null,
        teamId,
        teamName: token.team?.name,
        externalUserId: slackUserId,
        externalUserName,
        scopes: (token.authed_user?.scope ?? '').split(',').filter(Boolean),
        tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        settings: {
          publicChannels: true,
          privateChannels: false,
          groupDms: false,
          dms: false,
          excludedConversationIds: [],
          excludedConversationNames: [],
        },
      },
    })
    redirect('/dashboard/integrations?success=slack_user')
  }

  if (!token.access_token) redirect('/dashboard/integrations?error=slack_failed&reason=missing_bot_token')
  const encryptedToken = encrypt(token.access_token)

  await prisma.integration.upsert({
    where: { workspaceId_type: { workspaceId: user.workspace.id, type: 'slack' } },
    update: {
      accessToken: encryptedToken,
      botUserId: token.bot_user_id,
      teamId: token.team?.id,
      teamName: token.team?.name,
    },
    create: {
      workspaceId: user.workspace.id,
      type: 'slack',
      accessToken: encryptedToken,
      botUserId: token.bot_user_id,
      teamId: token.team?.id,
      teamName: token.team?.name,
      channels: [],
    },
  })

  redirect('/dashboard/integrations?success=slack')
}
