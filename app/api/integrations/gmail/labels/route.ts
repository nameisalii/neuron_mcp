import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { getAccessToken, listLabels, getLabelDetail } from '@/lib/gmail/api'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

async function getWorkspace(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  return user?.workspace?.id ?? null
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspaceId = await getWorkspace(userId)
    if (!workspaceId) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role) || member.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const integration = await prisma.integration.findUnique({
      where: { workspaceId_type: { workspaceId, type: 'gmail' } },
      select: { accessToken: true, metadata: true },
    })
    if (!integration) {
      return NextResponse.json({ error: 'Gmail is not connected' }, { status: 404 })
    }

    let accessToken: string
    try {
      accessToken = await getAccessToken(decrypt(integration.accessToken))
    } catch (err) {
      console.error('[gmail/labels] token refresh failed', err)
      return NextResponse.json({ error: 'Gmail connection expired — reconnect Gmail' }, { status: 422 })
    }

    const labels = await listLabels(accessToken)
    const detailed = await Promise.all(labels.map(async (label) => {
      try {
        const detail = await getLabelDetail(accessToken, label.id)
        return {
          id: detail.id,
          name: detail.name,
          type: detail.type === 'user' ? 'user' : 'system',
          messageCount: detail.messagesTotal ?? label.messagesTotal ?? 0,
          unreadCount: detail.messagesUnread ?? 0,
        }
      } catch {
        return {
          id: label.id,
          name: label.name,
          type: label.type === 'user' ? 'user' : 'system',
          messageCount: label.messagesTotal ?? 0,
          unreadCount: 0,
        }
      }
    }))

    const metadata = (integration.metadata as Record<string, unknown> | null) ?? {}
    return NextResponse.json({
      success: true,
      labels: detailed,
      configured: metadata.configured === true,
      selectedLabels: metadata.selectedLabels ?? [],
      selectedLabelNames: metadata.selectedLabelNames ?? [],
      privacy: metadata.privacy ?? 'personal',
    })
  } catch (err) {
    console.error('[gmail/labels]', err)
    return NextResponse.json({ error: 'Failed to load Gmail labels' }, { status: 500 })
  }
}
