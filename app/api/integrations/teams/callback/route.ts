import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { encodeTeamsToken, exchangeTeamsCode, getTeamsProfile } from '@/lib/teams/api'
import { getTeamsConfig } from '@/lib/teams/config'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

function integrationsRedirect(params: Record<string, string>): NextResponse {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_PRODUCT_URL ?? 'http://localhost:3000'
  const url = new URL('/dashboard/integrations', appUrl)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return integrationsRedirect({ error: 'teams_failed', reason: 'unauthorized' })

  const cookieStore = await cookies()
  const savedState = cookieStore.get('teams_oauth_state')?.value
  const searchParams = new URL(req.url).searchParams
  const returnedState = searchParams.get('state')
  const code = searchParams.get('code')
  cookieStore.delete('teams_oauth_state')

  if (!savedState) return integrationsRedirect({ error: 'teams_failed', reason: 'state_expired' })
  if (!returnedState || returnedState !== savedState) {
    return integrationsRedirect({ error: 'teams_failed', reason: 'invalid_state' })
  }
  if (!code) return integrationsRedirect({ error: 'teams_failed', reason: 'missing_code' })

  const [, stateUserId, workspaceId] = savedState.split('.')
  if (!stateUserId || stateUserId !== userId || !workspaceId) {
    return integrationsRedirect({ error: 'teams_failed', reason: 'state_user_mismatch' })
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, displayName: true },
  })
  if (!member || !ALLOWED_ROLES.has(member.role)) {
    return integrationsRedirect({ error: 'teams_failed', reason: 'forbidden' })
  }

  let token
  try {
    token = await exchangeTeamsCode(code)
  } catch {
    return integrationsRedirect({ error: 'teams_failed', reason: 'token_exchange_failed' })
  }

  const profile = await getTeamsProfile(token.accessToken)
  const config = getTeamsConfig()

  try {
    await prisma.integration.upsert({
      where: { workspaceId_type: { workspaceId, type: 'teams' } },
      create: {
        workspaceId,
        type: 'teams',
        accessToken: encodeTeamsToken(token),
        teamId: profile?.id ?? null,
        teamName: profile?.displayName ?? 'Microsoft Teams',
        channels: [],
        metadata: {
          status: 'connected',
          connectedBy: userId,
          connectedAt: new Date().toISOString(),
          tenantId: config.tenantId,
          accountId: profile?.id ?? null,
          accountDisplayName: profile?.displayName ?? null,
        },
        lastSyncAt: null,
      },
      update: {
        accessToken: encodeTeamsToken(token),
        teamId: profile?.id ?? null,
        teamName: profile?.displayName ?? 'Microsoft Teams',
        metadata: {
          status: 'connected',
          connectedBy: userId,
          connectedAt: new Date().toISOString(),
          tenantId: config.tenantId,
          accountId: profile?.id ?? null,
          accountDisplayName: profile?.displayName ?? null,
        },
        lastSyncAt: null,
      },
    })

    await prisma.syncStatus.upsert({
      where: { workspaceId_integration: { workspaceId, integration: 'teams' } },
      create: {
        workspaceId,
        integration: 'teams',
        mode: 'manual',
        status: 'active',
        configuredBy: userId,
        nextSyncAt: null,
      },
      update: {
        mode: 'manual',
        status: 'active',
        configuredBy: userId,
        errorMessage: null,
        nextSyncAt: null,
      },
    })

    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Microsoft Teams connected', {
      integration: 'teams',
      action: 'connected',
    })
  } catch {
    return integrationsRedirect({ error: 'teams_failed', reason: 'db_error' })
  }

  return integrationsRedirect({ connected: 'teams' })
}
