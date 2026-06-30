import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { getTeamsAuthorizeUrl, isTeamsOAuthConfigured } from '@/lib/teams/config'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isTeamsOAuthConfigured()) {
    return NextResponse.json(
      { error: 'Microsoft Teams is not configured. Add Microsoft OAuth environment variables to enable this integration.' },
      { status: 500 },
    )
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: user.workspace.id, userId } },
    select: { role: true },
  })
  if (!member || !ALLOWED_ROLES.has(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const stateToken = randomBytes(24).toString('hex')
  const state = `${stateToken}.${userId}.${user.workspace.id}`
  const authorizeUrl = getTeamsAuthorizeUrl(state)
  if (!authorizeUrl) {
    return NextResponse.json({ error: 'Microsoft Teams is not configured' }, { status: 500 })
  }

  const cookieStore = await cookies()
  cookieStore.set('teams_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return NextResponse.redirect(authorizeUrl)
}
