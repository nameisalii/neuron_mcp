import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { getNotionClientId, getNotionRedirectUri, isNotionOAuthConfigured } from '@/lib/notion/oauth'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.redirect(new URL('/sign-in', req.url))

  if (!isNotionOAuthConfigured()) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=notion_not_configured', req.url))
  }
  const clientId = getNotionClientId()

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=no_workspace', req.url))
  }

  const workspaceId = user.workspace.id
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  })
  if (!member || member.status !== 'active' || !ALLOWED_ROLES.has(member.role)) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=notion_forbidden', req.url))
  }

  const stateToken = randomBytes(24).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('notion_oauth_state', JSON.stringify({ stateToken, userId, workspaceId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    owner: 'user',
    redirect_uri: getNotionRedirectUri(),
    state: stateToken,
  })
  return NextResponse.redirect(`https://api.notion.com/v1/oauth/authorize?${params}`)
}
