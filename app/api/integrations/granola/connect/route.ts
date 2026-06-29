import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { verifyToken, GranolaApiError } from '@/lib/granola/api'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

const ConnectSchema = z.object({
  token: z.string().trim().min(8).startsWith('grn_', 'Granola keys start with "grn_"'),
})

async function getWorkspaceId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  return user?.workspace?.id ?? null
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspaceId = await getWorkspaceId(userId)
    if (!workspaceId) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role) || member.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = ConnectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid Granola personal API key' }, { status: 400 })
    }
    const { token } = parsed.data

    // Confirm the key works before storing it.
    try {
      await verifyToken(token)
    } catch (err) {
      if (err instanceof GranolaApiError && (err.status === 401 || err.status === 403)) {
        return NextResponse.json({ error: 'Granola rejected this API key. Check it and try again.' }, { status: 422 })
      }
      // Never log the token; log only a safe marker.
      console.error('[granola/connect] token verification failed')
      return NextResponse.json({ error: 'Could not reach Granola to verify the key. Try again.' }, { status: 502 })
    }

    const encryptedToken = encrypt(token)
    await prisma.integration.upsert({
      where: { workspaceId_type: { workspaceId, type: 'granola' } },
      update: {
        accessToken: encryptedToken,
        metadata: { status: 'connected', connectedBy: userId, connectedAt: new Date().toISOString() },
      },
      create: {
        workspaceId,
        type: 'granola',
        accessToken: encryptedToken,
        channels: [],
        metadata: { status: 'connected', connectedBy: userId, connectedAt: new Date().toISOString() },
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[granola/connect]', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Failed to save Granola API key' }, { status: 500 })
  }
}
