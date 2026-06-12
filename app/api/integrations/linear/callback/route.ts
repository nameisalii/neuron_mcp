import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

const REDIRECT_ERROR = '/dashboard/integrations?error=linear_failed'
const REDIRECT_OK = '/dashboard/integrations?connected=linear'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.redirect(new URL(REDIRECT_ERROR, req.url))

  const cookieStore = await cookies()
  const savedState = cookieStore.get('linear_oauth_state')?.value
  const { searchParams } = req.nextUrl
  const returnedState = searchParams.get('state')
  const code = searchParams.get('code')

  if (!savedState || !returnedState || savedState !== returnedState || !code) {
    return NextResponse.redirect(new URL(REDIRECT_ERROR, req.url))
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
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/linear/callback`,
        grant_type: 'authorization_code',
        code,
      }),
    })
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`)
    const data = await tokenRes.json()
    accessToken = data.access_token as string
  } catch (err) {
    console.error('[linear/callback] Token exchange error', err)
    return NextResponse.redirect(new URL(REDIRECT_ERROR, req.url))
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    if (!user?.workspace) return NextResponse.redirect(new URL(REDIRECT_ERROR, req.url))

    const workspaceId = user.workspace.id
    await prisma.integration.upsert({
      where: { workspaceId_type: { workspaceId, type: 'linear' } },
      create: {
        workspaceId,
        type: 'linear',
        accessToken: encrypt(accessToken),
        channels: [],
        lastSyncAt: null,
      },
      update: {
        accessToken: encrypt(accessToken),
        metadata: undefined,
        lastSyncAt: null,
      },
    })
  } catch (err) {
    console.error('[linear/callback] DB write error', err)
    return NextResponse.redirect(new URL(REDIRECT_ERROR, req.url))
  }

  return NextResponse.redirect(new URL(REDIRECT_OK, req.url))
}
