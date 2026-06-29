import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { getDiscordOAuthConfig } from '@/lib/discord/config'

interface DiscordTokenResponse {
  access_token?: string
  guild?: { id: string; name?: string }
  error?: string
}

export async function GET(req: Request) {
  const config = getDiscordOAuthConfig()
  if (!config) redirect('/dashboard/integrations?error=discord_not_configured')

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  if (!code || !stateParam) redirect('/dashboard/integrations?error=discord_failed')

  // Verify CSRF state against the httpOnly cookie.
  const cookieStore = await cookies()
  const rawCookie = cookieStore.get('discord_oauth_state')?.value
  cookieStore.delete('discord_oauth_state')
  if (!rawCookie) redirect('/dashboard/integrations?error=discord_failed')

  let cookieState: { state: string; userId: string }
  try {
    cookieState = JSON.parse(rawCookie) as { state: string; userId: string }
  } catch {
    redirect('/dashboard/integrations?error=discord_failed')
  }
  if (stateParam !== cookieState!.state) redirect('/dashboard/integrations?error=discord_failed')

  // Verify the Clerk session belongs to the user who initiated the flow.
  const { userId: sessionUserId } = await auth()
  if (!sessionUserId || sessionUserId !== cookieState!.userId) {
    redirect('/dashboard/integrations?error=discord_failed')
  }

  let token: DiscordTokenResponse
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config!.clientId,
        client_secret: config!.clientSecret,
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: config!.redirectUri,
      }),
    })
    token = (await tokenRes.json()) as DiscordTokenResponse
  } catch {
    // Do not log tokens/secrets.
    console.error('[discord/callback] token exchange request failed')
    redirect('/dashboard/integrations?error=discord_failed')
  }

  if (!token!.access_token || !token!.guild?.id) {
    redirect('/dashboard/integrations?error=discord_failed')
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: cookieState!.userId },
    include: { workspace: true },
  })
  if (!user?.workspace) redirect('/dashboard/integrations?error=no_workspace')

  await prisma.integration.upsert({
    where: { workspaceId_type: { workspaceId: user.workspace.id, type: 'discord' } },
    update: {
      accessToken: encrypt(token!.access_token!),
      teamId: token!.guild!.id,
      teamName: token!.guild!.name ?? null,
      metadata: { status: 'connected', connectedBy: cookieState!.userId, connectedAt: new Date().toISOString() },
    },
    create: {
      workspaceId: user.workspace.id,
      type: 'discord',
      accessToken: encrypt(token!.access_token!),
      teamId: token!.guild!.id,
      teamName: token!.guild!.name ?? null,
      channels: [],
      metadata: { status: 'connected', connectedBy: cookieState!.userId, connectedAt: new Date().toISOString() },
    },
  })

  redirect('/dashboard/integrations?success=discord')
}
