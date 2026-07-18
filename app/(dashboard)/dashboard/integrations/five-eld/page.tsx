import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Navigation } from 'lucide-react'
import { prisma } from '@/lib/db'
import FiveEldConnectionPanel from './FiveEldConnectionPanel'
import TruckIntegrationLogo from '@/components/TruckIntegrationLogo'

export default async function FiveEldPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { workspace: { select: { id: true } } } })
  if (!user?.workspace?.id) redirect('/onboarding')
  const connector = await prisma.apiConnector.findUnique({ where: { workspaceId_sourceKey: { workspaceId: user.workspace.id, sourceKey: 'five_eld' } }, select: { status: true, lastSyncAt: true, metadata: true } })
  const metadata = connector?.metadata && typeof connector.metadata === 'object' && !Array.isArray(connector.metadata) ? connector.metadata as Record<string, unknown> : {}
  const capabilities = metadata.capabilities && typeof metadata.capabilities === 'object' && !Array.isArray(metadata.capabilities) ? metadata.capabilities as Record<string, unknown> : {}
  return <div className="mx-auto max-w-7xl space-y-6"><Link href="/dashboard/integrations" className="text-sm text-muted hover:text-ink">← Back to Integrations</Link><header className="flex items-start gap-4"><TruckIntegrationLogo provider="five_eld" size={40} className="rounded-2xl" /><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><Navigation className="h-3.5 w-3.5" />Truck integration</p><h1 className="mt-1 text-3xl font-display font-semibold">Five ELD</h1><p className="mt-2 max-w-3xl text-muted">Connect your fleet’s live ELD data to Neuron so you can ask questions like “Where is this driver right now?” or “Which trucks have stale GPS?”</p></div></header><FiveEldConnectionPanel connected={connector?.status === 'connected'} initialCompanyId={typeof metadata.companyId === 'string' ? metadata.companyId : ''} initialUsdot={typeof metadata.usdot === 'string' ? metadata.usdot : ''} initialLiveGps={capabilities.realtimeUnitsByUsdot === true} lastSyncAt={connector?.lastSyncAt?.toISOString() ?? null} /></div>
}
