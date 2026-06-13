import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { getLinearRedirectUri } from '@/lib/linear/oauth'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stateToken = randomBytes(16).toString('hex')
  const state = `${stateToken}.${userId}`
  const cookieStore = await cookies()
  cookieStore.set('linear_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: process.env.LINEAR_CLIENT_ID!,
    redirect_uri: getLinearRedirectUri(),
    response_type: 'code',
    scope: 'read',
    state,
  })

  return NextResponse.redirect(`https://linear.app/oauth/authorize?${params}`)
}
