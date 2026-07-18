import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { ttEldFriendlyError } from '@/lib/tteld/client'
import { encodeTtEldCredentials, TTELD_SOURCE } from '@/lib/tteld/credentials'
import { trackEvent } from '@/lib/activity'
import { FiveEldInputSchema, fiveEldValidationIssues } from '@/lib/tteld/input'
import { primaryProbeError, probeFiveEldCapabilities } from '@/lib/tteld/probe'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = FiveEldInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ success: false, code: 'validation_error', error: 'Please fill in Company ID, USDOT, and API key.', issues: fiveEldValidationIssues(parsed.error) }, { status: 400 })
  try {
    const probe = await probeFiveEldCapabilities(parsed.data)
    if (!probe.ok) throw primaryProbeError(probe)?.error ?? new Error('Five ELD endpoint probe failed')
    const connectedAt = new Date().toISOString()
    const metadata = { provider: TTELD_SOURCE, companyId: parsed.data.companyId, usdot: parsed.data.usdot, connectionMode: 'api', connectedAt, capabilities: probe.capabilities, warnings: probe.warnings, counts: { realtimeUnits: probe.counts.realtimeUnits, currentAssignments: probe.counts.currentUnits, activeDrivers: probe.counts.drivers } }
    const connector = await prisma.apiConnector.upsert({
      where: { workspaceId_sourceKey: { workspaceId: workspace.workspaceId, sourceKey: TTELD_SOURCE } },
      create: { workspaceId: workspace.workspaceId, name: 'Five ELD', sourceKey: TTELD_SOURCE, apiBaseUrl: 'https://read.tteld.com', authType: 'api_headers', encryptedCredential: encodeTtEldCredentials(parsed.data), status: 'connected', metadata: metadata as Prisma.InputJsonValue },
      update: { apiBaseUrl: 'https://read.tteld.com', authType: 'api_headers', encryptedCredential: encodeTtEldCredentials(parsed.data), status: 'connected', metadata: metadata as Prisma.InputJsonValue },
      select: { id: true, status: true },
    })
    await trackEvent(workspace.workspaceId, userId, workspace.member.displayName, 'sync', 'Five ELD connected', { integration: TTELD_SOURCE, action: 'connected' })
    return NextResponse.json({ success: true, connector: { id: connector.id, status: connector.status, companyId: parsed.data.companyId, usdot: parsed.data.usdot }, capabilities: probe.capabilities, warnings: probe.warnings, message: probe.capabilities.realtimeUnitsByUsdot ? 'Five ELD connected with live GPS.' : 'Five ELD connected with limited capabilities.' })
  } catch (error) {
    await trackEvent(workspace.workspaceId, userId, workspace.member.displayName, 'sync', 'Five ELD credentials rejected', { integration: TTELD_SOURCE, action: 'connection_failed' })
    return NextResponse.json({ success: false, error: ttEldFriendlyError(error) }, { status: 422 })
  }
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })
  const connector = await prisma.apiConnector.findUnique({ where: { workspaceId_sourceKey: { workspaceId: workspace.workspaceId, sourceKey: TTELD_SOURCE } }, select: { status: true, lastSyncAt: true, metadata: true } })
  const metadata = connector?.metadata && typeof connector.metadata === 'object' && !Array.isArray(connector.metadata) ? connector.metadata as Record<string, unknown> : {}
  return NextResponse.json({ connected: connector?.status === 'connected', status: connector?.status ?? 'not_connected', companyId: typeof metadata.companyId === 'string' ? metadata.companyId : null, usdot: typeof metadata.usdot === 'string' ? metadata.usdot : null, lastSyncAt: connector?.lastSyncAt?.toISOString() ?? null, capabilities: metadata.capabilities && typeof metadata.capabilities === 'object' ? metadata.capabilities : {}, counts: metadata.counts ?? {} })
}
