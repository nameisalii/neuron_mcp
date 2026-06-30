import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { encodeJiraToken, exchangeJiraCode, getAccessibleJiraResources } from '@/lib/jira/api'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

function integrationsRedirect(params: Record<string, string>): NextResponse {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_PRODUCT_URL ?? 'http://localhost:3000'
  const url = new URL('/dashboard/integrations', appUrl)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return integrationsRedirect({ error: 'jira_failed', reason: 'unauthorized' })

  const cookieStore = await cookies()
  const savedState = cookieStore.get('jira_oauth_state')?.value
  const searchParams = new URL(req.url).searchParams
  const returnedState = searchParams.get('state')
  const code = searchParams.get('code')
  cookieStore.delete('jira_oauth_state')

  if (!savedState) return integrationsRedirect({ error: 'jira_failed', reason: 'state_expired' })
  if (!returnedState || returnedState !== savedState) {
    return integrationsRedirect({ error: 'jira_failed', reason: 'invalid_state' })
  }
  if (!code) return integrationsRedirect({ error: 'jira_failed', reason: 'missing_code' })

  const [, stateUserId, workspaceId] = savedState.split('.')
  if (!stateUserId || stateUserId !== userId || !workspaceId) {
    return integrationsRedirect({ error: 'jira_failed', reason: 'state_user_mismatch' })
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, displayName: true },
  })
  if (!member || !ALLOWED_ROLES.has(member.role)) {
    return integrationsRedirect({ error: 'jira_failed', reason: 'forbidden' })
  }

  let token
  try {
    token = await exchangeJiraCode(code)
  } catch {
    return integrationsRedirect({ error: 'jira_failed', reason: 'token_exchange_failed' })
  }

  let resources
  try {
    resources = await getAccessibleJiraResources(token.accessToken)
  } catch {
    return integrationsRedirect({ error: 'jira_failed', reason: 'resources_failed' })
  }
  const selected = resources[0]
  if (!selected?.id) {
    return integrationsRedirect({ error: 'jira_failed', reason: 'no_accessible_resources' })
  }

  try {
    await prisma.integration.upsert({
      where: { workspaceId_type: { workspaceId, type: 'jira' } },
      create: {
        workspaceId,
        type: 'jira',
        accessToken: encodeJiraToken(token),
        teamId: selected.id,
        teamName: selected.name ?? 'Jira Cloud',
        channels: [],
        metadata: {
          status: 'connected',
          connectedBy: userId,
          connectedAt: new Date().toISOString(),
          cloudId: selected.id,
          siteUrl: selected.url,
          siteName: selected.name ?? null,
          resources: resources.map((resource) => ({
            id: resource.id,
            url: resource.url,
            name: resource.name ?? null,
            scopes: resource.scopes ?? [],
            avatarUrl: resource.avatarUrl ?? null,
          })),
        },
        lastSyncAt: null,
      },
      update: {
        accessToken: encodeJiraToken(token),
        teamId: selected.id,
        teamName: selected.name ?? 'Jira Cloud',
        metadata: {
          status: 'connected',
          connectedBy: userId,
          connectedAt: new Date().toISOString(),
          cloudId: selected.id,
          siteUrl: selected.url,
          siteName: selected.name ?? null,
          resources: resources.map((resource) => ({
            id: resource.id,
            url: resource.url,
            name: resource.name ?? null,
            scopes: resource.scopes ?? [],
            avatarUrl: resource.avatarUrl ?? null,
          })),
        },
        lastSyncAt: null,
      },
    })

    await prisma.syncStatus.upsert({
      where: { workspaceId_integration: { workspaceId, integration: 'jira' } },
      create: {
        workspaceId,
        integration: 'jira',
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

    await trackEvent(workspaceId, userId, member.displayName, 'sync', 'Jira connected', {
      integration: 'jira',
      action: 'connected',
    })
  } catch {
    return integrationsRedirect({ error: 'jira_failed', reason: 'db_error' })
  }

  return integrationsRedirect({ connected: 'jira' })
}
