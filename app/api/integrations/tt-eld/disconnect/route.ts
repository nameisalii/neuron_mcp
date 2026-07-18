import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })
  await prisma.apiConnector.updateMany({ where: { workspaceId: workspace.workspaceId, sourceKey: 'five_eld' }, data: { encryptedCredential: null, status: 'disconnected', lastSyncAt: null, metadata: { provider: 'five_eld', disconnectedAt: new Date().toISOString() } as Prisma.InputJsonValue } })
  return NextResponse.json({ success: true })
}

export const POST = DELETE
