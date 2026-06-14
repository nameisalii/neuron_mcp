import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getConnectedIntegrationToken } from '@/lib/integrations/connection-server'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: {
      id: true,
      workspace: {
        select: {
          id: true,
          type: true,
          owner: { select: { clerkId: true } },
          integrations: {
            where: { type: 'notion' },
            select: { id: true, workspaceId: true, type: true, accessToken: true, metadata: true },
          },
        },
      },
    },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

  const integration = user.workspace.integrations[0] ?? null
  const [pagesCount, pageOwners] = await Promise.all([
    prisma.notionPage.count({ where: { workspaceId: user.workspace.id } }),
    prisma.notionPage.findMany({
      where: { workspaceId: user.workspace.id },
      distinct: ['syncedBy'],
      select: { syncedBy: true },
    }),
  ])
  const metadata = integration?.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata)
    ? integration.metadata as Record<string, unknown>
    : {}

  return NextResponse.json({
    clerkUserId: userId,
    internalUserId: user.id,
    activeWorkspaceId: user.workspace.id,
    workspaceType: user.workspace.type,
    workspaceOwnerClerkId: user.workspace.owner.clerkId,
    notionIntegrationId: integration?.id ?? null,
    notionIntegrationWorkspaceId: integration?.workspaceId ?? null,
    notionConnectedBy: typeof metadata.connectedBy === 'string' ? metadata.connectedBy : null,
    notionTokenExists: Boolean(integration?.accessToken),
    notionConnected: Boolean(getConnectedIntegrationToken(integration, {
      currentUserId: userId,
      workspaceType: user.workspace.type,
      workspaceOwnerClerkId: user.workspace.owner.clerkId,
    })),
    notionPagesCount: pagesCount,
    notionPageSyncedBy: pageOwners.map((page) => page.syncedBy).filter(Boolean),
  })
}
