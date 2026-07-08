import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { getDatatruckEnvConfig, isDatatruckEnvConfigured } from '@/lib/datatruck/client'

/**
 * Read-only connection status for the Datatruck integration.
 * Returns only safe fields — never credentials or the API base URL auth header.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  const connector = await prisma.apiConnector.findUnique({
    where: { workspaceId_sourceKey: { workspaceId: workspace.workspaceId, sourceKey: 'datatruck' } },
    select: { id: true, status: true, lastSyncAt: true, createdAt: true, metadata: true },
  })

  const metadata = connector?.metadata && typeof connector.metadata === 'object' && !Array.isArray(connector.metadata)
    ? connector.metadata as Record<string, unknown>
    : {}
  const envConfig = getDatatruckEnvConfig()

  return NextResponse.json({
    success: true,
    connected: connector?.status === 'connected',
    status: connector?.status ?? (isDatatruckEnvConfigured(envConfig) ? 'ready_to_connect' : 'not_connected'),
    companyName: typeof metadata.companyName === 'string' ? metadata.companyName : null,
    lastSyncAt: connector?.lastSyncAt?.toISOString() ?? null,
    createdAt: connector?.createdAt.toISOString() ?? null,
    envFallbackAvailable: isDatatruckEnvConfigured(envConfig),
  })
}
