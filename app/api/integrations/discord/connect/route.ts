import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import crypto from 'node:crypto'
import { getDiscordInstallConfig } from '@/lib/discord/config'

// Minimal bot permissions to read text: View Channel (1024) + Read Message History (65536).
const DISCORD_BOT_PERMISSIONS = '66560'
const DISCORD_SCOPES = 'bot'

export async function GET() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const config = getDiscordInstallConfig()
  if (!config) {
    // Missing env must not break the app — guide the user instead.
    redirect('/dashboard/integrations?error=discord_not_configured')
  }

  const state = crypto.randomBytes(32).toString('hex')

  const cookieStore = await cookies()
  cookieStore.set('discord_oauth_state', JSON.stringify({ state, userId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: config.clientId,
    permissions: DISCORD_BOT_PERMISSIONS,
    scope: DISCORD_SCOPES,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    state,
  })

  redirect(`https://discord.com/oauth2/authorize?${params}`)
}
