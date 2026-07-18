import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { createTtEldClient } from '@/lib/tteld/client'
import { loadTtEldConnection } from '@/lib/tteld/credentials'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })
  const connection = await loadTtEldConnection(workspace.workspaceId)
  if (!connection) return NextResponse.json({ error: 'Five ELD is not connected.' }, { status: 404 })
  try {
    const client = createTtEldClient(connection.credentials)
    const assignments = await client.getCurrentUnits({ isActive: true })
    const locations = await Promise.allSettled(assignments.slice(0, 100).map((item) => client.getTrackingByVin(item.vin)))
    const byVin = new Map(locations.flatMap((result) => result.status === 'fulfilled' ? [[result.value.vin, result.value] as const] : []))
    return NextResponse.json({ units: assignments.map((item) => {
      const location = byVin.get(item.vin)
      const timestamp = location?.timestamp ?? null
      const freshnessSeconds = timestamp ? Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)) : null
      return { truckNumber: item.truck_number, driver: [item.driver?.first_name, item.driver?.second_name].filter(Boolean).join(' ') || null, vin: item.vin, coordinates: location?.coordinates ?? null, speed: location?.speed ?? null, rotation: location?.rotation ?? null, timestamp, freshnessSeconds, stale: freshnessSeconds === null || freshnessSeconds > 1800 }
    }) })
  } catch { return NextResponse.json({ error: 'Five ELD live fleet is temporarily unavailable.' }, { status: 502 }) }
}
