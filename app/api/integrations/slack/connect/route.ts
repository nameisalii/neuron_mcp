import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import crypto from 'node:crypto'
import { buildSlackAuthorizeUrl, getSlackRedirectUri, parseSlackMode } from '@/lib/slack/oauth'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) throw new Error('Missing SLACK_CLIENT_ID')

  const state = crypto.randomBytes(32).toString('hex')
  const mode = parseSlackMode(new URL(req.url).searchParams.get('mode'))

  const cookieStore = await cookies()
  cookieStore.set('slack_oauth_state', JSON.stringify({ state, userId, mode }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  redirect(buildSlackAuthorizeUrl({
    clientId,
    redirectUri: getSlackRedirectUri(),
    state,
    mode,
    teamId: process.env.SLACK_ALLOWED_TEAM_ID,
  }))
}
