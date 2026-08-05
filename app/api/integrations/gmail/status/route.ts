import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isGmailIntegrationEnabled, isGmailPublicEnabled } from '@/lib/gmail/access'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId: user.workspace.id, type: 'gmail' } },
    select: { createdAt: true, lastSyncAt: true, metadata: true },
  })
  const importedThreads = integration
    ? await prisma.emailThread.count({ where: { workspaceId: user.workspace.id, syncedBy: userId } })
    : 0
  const metadata = integration?.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata)
    ? integration.metadata as Record<string, unknown>
    : {}

  return NextResponse.json({
    enabled: isGmailIntegrationEnabled(),
    publicEnabled: isGmailPublicEnabled(),
    connected: Boolean(integration),
    createdAt: integration?.createdAt ?? null,
    lastSyncAt: integration?.lastSyncAt ?? null,
    metadata: integration ? {
      status: metadata.status ?? null,
      configured: metadata.configured === true,
      selectedLabels: Array.isArray(metadata.selectedLabels) ? metadata.selectedLabels : [],
      selectedLabelNames: Array.isArray(metadata.selectedLabelNames) ? metadata.selectedLabelNames : [],
      timeWindow: typeof metadata.timeWindow === 'number' ? metadata.timeWindow : null,
      lastSyncAttemptAt: typeof metadata.lastSyncAttemptAt === 'string' ? metadata.lastSyncAttemptAt : null,
      lastSuccessfulImportAt: typeof metadata.lastSuccessfulImportAt === 'string' ? metadata.lastSuccessfulImportAt : null,
    } : null,
    importedThreads,
  })
}
