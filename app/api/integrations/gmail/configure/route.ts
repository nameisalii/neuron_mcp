import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { estimateMessageCount, getAccessToken } from '@/lib/gmail/api'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

const ConfigureSchema = z.object({
  selectedLabels: z.array(z.string().min(1)).min(1),
  selectedLabelNames: z.array(z.string().min(1)).optional(),
  timeWindow: z.number().int().positive().max(3650).default(30),
  syncFrom: z.string().datetime().nullable().optional(),
  senderFilter: z.array(z.string()).default([]),
  excludeFilter: z.array(z.string()).default([]),
  maxMessages: z.number().int().positive().max(500).optional(),
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
      select: { role: true, status: true, displayName: true },
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

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = ConfigureSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Gmail configuration', details: parsed.error.flatten() }, { status: 400 })
    }

    const config = parsed.data
    const selectedLabelNames = config.selectedLabelNames?.length ? config.selectedLabelNames : config.selectedLabels
    const maxMessages = config.maxMessages ?? 200
    const computedTimeWindow = config.syncFrom
      ? Math.max(1, Math.ceil((Date.now() - new Date(config.syncFrom).getTime()) / (24 * 60 * 60 * 1000)))
      : config.timeWindow

    let accessToken: string
    try {
      accessToken = await getAccessToken(decrypt(integration.accessToken))
    } catch (err) {
      console.error('[gmail/configure] token refresh failed', err)
      return NextResponse.json({ error: 'Gmail connection expired — reconnect Gmail' }, { status: 422 })
    }

    let estimatedMessages = 0
    try {
      const estimates = await Promise.all(config.selectedLabels.map((label) => estimateMessageCount(accessToken, label, '')))
      estimatedMessages = estimates.reduce((sum, count) => sum + count, 0)
    } catch (err) {
      console.error('[gmail/configure] estimate failed', err)
    }

    const metadata = {
      status: 'configured',
      configured: true,
      privacy: 'personal',
      selectedLabels: config.selectedLabels,
      selectedLabelNames,
      timeWindow: computedTimeWindow,
      syncFrom: config.syncFrom ?? undefined,
      senderFilter: config.senderFilter,
      excludeFilter: config.excludeFilter,
      maxMessages,
      configuredAt: new Date().toISOString(),
      configuredBy: userId,
    }

    await prisma.integration.update({
      where: { workspaceId_type: { workspaceId, type: 'gmail' } },
      data: { metadata, lastSyncAt: null },
    })

    await prisma.syncStatus.upsert({
      where: { workspaceId_integration: { workspaceId, integration: 'gmail' } },
      create: {
        workspaceId,
        integration: 'gmail',
        mode: 'background',
        status: 'active',
        configuredBy: userId,
        nextSyncAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      update: {
        mode: 'background',
        status: 'active',
        configuredBy: userId,
        nextSyncAt: new Date(Date.now() + 5 * 60 * 1000),
        errorMessage: null,
      },
    })

    return NextResponse.json({
      success: true,
      estimatedMessages,
      selectedLabels: config.selectedLabels,
      selectedLabelNames,
      privacyMode: 'personal',
      maxMessages,
      syncFrom: config.syncFrom ?? null,
    })
  } catch (err) {
    console.error('[gmail/configure]', err)
    return NextResponse.json({ error: 'Failed to save Gmail configuration' }, { status: 500 })
  }
}
