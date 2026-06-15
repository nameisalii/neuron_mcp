import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { getNotionAppUrl, getNotionClientId, getNotionClientSecret, getNotionRedirectUri } from '@/lib/notion/oauth'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const NOTION_OAUTH_ERROR_CODES = new Set([
  'invalid_client',
  'invalid_grant',
  'invalid_request',
  'unauthorized_client',
  'unsupported_grant_type',
])

class NotionTokenExchangeError extends Error {
  constructor(readonly reason: string, message: string) {
    super(message)
  }
}

function redirectToIntegrations(params: Record<string, string>) {
  const url = new URL('/dashboard/integrations', getNotionAppUrl())
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return redirectToIntegrations({ error: 'notion_failed', reason: 'unauthorized' })

  const cookieStore = await cookies()
  const rawState = cookieStore.get('notion_oauth_state')?.value
  cookieStore.delete('notion_oauth_state')
  const code = req.nextUrl.searchParams.get('code')
  const returnedState = req.nextUrl.searchParams.get('state')

  let savedState: { stateToken: string; userId: string; workspaceId: string }
  try {
    savedState = JSON.parse(rawState ?? '')
  } catch {
    return redirectToIntegrations({ error: 'notion_failed', reason: 'state_expired' })
  }

  if (!code || !returnedState || returnedState !== savedState.stateToken || savedState.userId !== userId) {
    return redirectToIntegrations({ error: 'notion_failed', reason: 'invalid_state' })
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: savedState.workspaceId, userId } },
    select: { role: true, status: true },
  })
  if (!member || member.status !== 'active' || !ALLOWED_ROLES.has(member.role)) {
    return redirectToIntegrations({ error: 'notion_failed', reason: 'workspace_mismatch' })
  }

  let tokenData: {
    access_token?: string
    refresh_token?: string
    workspace_id?: string
    workspace_name?: string | null
    workspace_icon?: string | null
    bot_id?: string
  }
  try {
    const credentials = Buffer.from(`${getNotionClientId()}:${getNotionClientSecret()}`).toString('base64')
    const response = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2026-03-11',
      },
      body: JSON.stringify({
        client_id: getNotionClientId(),
        client_secret: getNotionClientSecret(),
        grant_type: 'authorization_code',
        code,
        redirect_uri: getNotionRedirectUri(),
      }),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      let providerError: string | undefined
      try {
        const parsed = JSON.parse(errorText) as { error?: unknown; code?: unknown }
        providerError = typeof parsed.error === 'string'
          ? parsed.error
          : typeof parsed.code === 'string' ? parsed.code : undefined
      } catch {
        providerError = undefined
      }
      const reason = providerError && NOTION_OAUTH_ERROR_CODES.has(providerError)
        ? providerError
        : 'token_exchange'
      throw new NotionTokenExchangeError(
        reason,
        `Notion token exchange failed: ${response.status} ${errorText}`.trim(),
      )
    }
    tokenData = await response.json()
    if (!tokenData.access_token) throw new Error('Notion token response missing access_token')
  } catch (err) {
    console.error('[notion/callback] Token exchange failed', err)
    return redirectToIntegrations({
      error: 'notion_failed',
      reason: err instanceof NotionTokenExchangeError ? err.reason : 'token_exchange',
    })
  }

  await prisma.integration.upsert({
    where: { workspaceId_type: { workspaceId: savedState.workspaceId, type: 'notion' } },
    create: {
      workspaceId: savedState.workspaceId,
      type: 'notion',
      accessToken: encrypt(tokenData.access_token),
      botUserId: tokenData.bot_id ?? null,
      teamId: tokenData.workspace_id ?? null,
      teamName: tokenData.workspace_name ?? null,
      channels: [],
      metadata: {
        status: 'connected',
        connectedBy: userId,
        notionWorkspaceId: tokenData.workspace_id ?? null,
        notionWorkspaceName: tokenData.workspace_name ?? null,
        notionWorkspaceIcon: tokenData.workspace_icon ?? null,
        encryptedRefreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
      },
    },
    update: {
      accessToken: encrypt(tokenData.access_token),
      botUserId: tokenData.bot_id ?? null,
      teamId: tokenData.workspace_id ?? null,
      teamName: tokenData.workspace_name ?? null,
      metadata: {
        status: 'connected',
        connectedBy: userId,
        notionWorkspaceId: tokenData.workspace_id ?? null,
        notionWorkspaceName: tokenData.workspace_name ?? null,
        notionWorkspaceIcon: tokenData.workspace_icon ?? null,
        encryptedRefreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
      },
      lastSyncAt: null,
    },
  })

  return redirectToIntegrations({ connected: 'notion' })
}
