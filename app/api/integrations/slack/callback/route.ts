import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { redirect } from 'next/navigation'
import type { SlackOAuthToken } from '@/types'
import { getAppUrl } from '@/lib/app-url'

export async function GET(req: Request) {
  const APP_URL = getAppUrl()
  const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID
  const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')

  if (!code || !stateParam) redirect('/dashboard?error=slack_failed')

  // Verify CSRF state against the httpOnly cookie
  const cookieStore = await cookies()
  const rawCookie = cookieStore.get('slack_oauth_state')?.value
  cookieStore.delete('slack_oauth_state')

  if (!rawCookie) redirect('/dashboard?error=slack_failed')

  let cookieState: { state: string; userId: string }
  try {
    cookieState = JSON.parse(rawCookie) as { state: string; userId: string }
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
      redirect_uri: `${APP_URL}/api/integrations/slack/callback`,
    }),
  })

  const token = (await tokenRes.json()) as SlackOAuthToken

  if (!token.ok) {
    redirect('/dashboard?error=slack_failed')
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: cookieState.userId },
    include: { workspace: true },
  })

  if (!user?.workspace) redirect('/dashboard?error=no_workspace')

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
