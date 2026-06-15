import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import crypto from 'node:crypto'
import { getAppUrl } from '@/lib/app-url'

const SLACK_SCOPES = [
  'channels:history',
  'channels:read',
  'users:read',
  'team:read',
  'chat:write',
  'commands',
].join(',')

export async function GET() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const appUrl = getAppUrl()
  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) throw new Error('Missing SLACK_CLIENT_ID')

  const state = crypto.randomBytes(32).toString('hex')

  const cookieStore = await cookies()
  cookieStore.set('slack_oauth_state', JSON.stringify({ state, userId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_SCOPES,
    redirect_uri: `${appUrl}/api/integrations/slack/callback`,
    state,
  })

  redirect(`https://slack.com/oauth/v2/authorize?${params}`)
}
