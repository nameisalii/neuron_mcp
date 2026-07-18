import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { loadTtEldConnection } from '@/lib/tteld/credentials'
import { syncTtEldKnowledge } from '@/lib/tteld/sync'
import { trackEvent } from '@/lib/activity'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })
  const connection = await loadTtEldConnection(workspace.workspaceId)
  if (!connection) return NextResponse.json({ success: false, error: 'Five ELD is not connected.' }, { status: 404 })
  try {
    const result = await syncTtEldKnowledge(workspace.workspaceId, connection.credentials)
    const now = new Date()
    const metadata = { ...connection.metadata, counts: { realtimeUnits: result.counts.realtime_units, currentAssignments: result.counts.current_units, activeDrivers: result.counts.drivers, activeUnits72h: result.counts.active_units_72h }, lastSyncSummary: result }
    if (connection.connector.id !== 'five-eld-env') await prisma.apiConnector.update({ where: { id: connection.connector.id }, data: { status: result.ok ? 'connected' : 'sync_error', lastSyncAt: result.ok ? now : connection.connector.lastSyncAt, metadata: metadata as unknown as Prisma.InputJsonValue } })
    await trackEvent(workspace.workspaceId, userId, workspace.member.displayName, 'sync', `Five ELD synced ${result.counts.realtime_units} live units`, { integration: 'five_eld', action: 'completed', ...result.counts })
    return NextResponse.json({ success: result.ok, synced: result.created + result.updated, ...result })
  } catch {
    if (connection.connector.id !== 'five-eld-env') await prisma.apiConnector.update({ where: { id: connection.connector.id }, data: { status: 'sync_error' } }).catch(() => null)
    return NextResponse.json({ success: false, error: 'Five ELD sync failed. Check credentials and try again.' }, { status: 500 })
  }
}
