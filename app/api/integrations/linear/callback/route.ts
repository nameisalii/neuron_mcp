import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { trackEvent } from '@/lib/activity'
import { getAppUrl, getLinearRedirectUri } from '@/lib/linear/oauth'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function GET(req: NextRequest) {
  const appUrl = getAppUrl()
  const redirectError = `${appUrl}/dashboard/integrations?error=linear_failed`
  const redirectOk = `${appUrl}/dashboard/integrations?connected=linear`
  const { userId } = await auth()
  if (!userId) return NextResponse.redirect(redirectError)

  const cookieStore = await cookies()
  const savedState = cookieStore.get('linear_oauth_state')?.value
  const { searchParams } = req.nextUrl
  const returnedState = searchParams.get('state')
  const code = searchParams.get('code')

  if (!savedState || !returnedState || savedState !== returnedState || !code) {
    return NextResponse.redirect(redirectError)
  }

  const embeddedUserId = savedState.split('.')[1]
  if (!embeddedUserId || embeddedUserId !== userId) {
    return NextResponse.redirect(redirectError)
  }

  cookieStore.delete('linear_oauth_state')

  let accessToken: string
  try {
    const tokenRes = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.LINEAR_CLIENT_ID!,
        client_secret: process.env.LINEAR_CLIENT_SECRET!,
        redirect_uri: getLinearRedirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    })
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`)
    const data = await tokenRes.json()
    if (typeof data.access_token !== 'string' || !data.access_token) {
      throw new Error('Linear token response missing access_token')
    }
    accessToken = data.access_token
  } catch (err) {
    console.error('[linear/callback] Token exchange error', err)
    return NextResponse.redirect(redirectError)
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    if (!user?.workspace) return NextResponse.redirect(redirectError)

    const workspaceId = user.workspace.id
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, displayName: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role)) return NextResponse.redirect(redirectError)

    let organization: { id: string; name: string } | null = null
    try {
      const orgRes = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: accessToken },
        body: JSON.stringify({ query: 'query { organization { id name } }' }),
      })
      const orgJson = await orgRes.json()
      organization = orgJson.data?.organization ?? null
    } catch (err) {
      console.error('[linear/callback] Organization lookup failed', err)
    }

    await prisma.integration.upsert({
      where: { workspaceId_type: { workspaceId, type: 'linear' } },
      create: {
        workspaceId,
        type: 'linear',
        accessToken: encrypt(accessToken),
        teamId: organization?.id ?? null,
        teamName: organization?.name ?? null,
        channels: [],
        metadata: { status: 'active' },
        lastSyncAt: null,
      },
      update: {
        accessToken: encrypt(accessToken),
        teamId: organization?.id ?? null,
        teamName: organization?.name ?? null,
        metadata: { status: 'active' },
        lastSyncAt: null,
      },
    })
    await prisma.syncStatus.upsert({
      where: { workspaceId_integration: { workspaceId, integration: 'linear' } },
      create: {
        workspaceId,
        integration: 'linear',
        mode: 'background',
        status: 'active',
        configuredBy: userId,
        nextSyncAt: new Date(),
      },
      update: { mode: 'background', status: 'active', configuredBy: userId, nextSyncAt: new Date(), errorMessage: null },
    })
    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Linear connected', {
      integration: 'linear',
      action: 'connected',
      organizationId: organization?.id,
      organizationName: organization?.name,
    })
  } catch (err) {
    console.error('[linear/callback] DB write error', err)
    return NextResponse.redirect(redirectError)
  }

  return NextResponse.redirect(redirectOk)
}
