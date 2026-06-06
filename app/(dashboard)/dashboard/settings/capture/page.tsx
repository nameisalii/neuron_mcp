import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import CaptureSettingsClient from './CaptureSettingsClient'

export default async function CaptureSettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) redirect('/dashboard')

  const { id: workspaceId } = user.workspace

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  })
  const canManage = member?.role === 'owner' || member?.role === 'admin'

  const [notionRules, slackRules, notionStatus, slackStatus, recentLogs, members, integration] =
    await Promise.all([
      prisma.captureRule.findMany({ where: { workspaceId, integration: 'notion' }, orderBy: { createdAt: 'asc' } }),
      prisma.captureRule.findMany({ where: { workspaceId, integration: 'slack' }, orderBy: { createdAt: 'asc' } }),
      prisma.syncStatus.findUnique({ where: { workspaceId_integration: { workspaceId, integration: 'notion' } } }),
      prisma.syncStatus.findUnique({ where: { workspaceId_integration: { workspaceId, integration: 'slack' } } }),
      prisma.captureLog.findMany({ where: { workspaceId }, orderBy: { timestamp: 'desc' }, take: 20 }),
      prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true, displayName: true } }),
      prisma.integration.findUnique({
        where: { workspaceId_type: { workspaceId, type: 'slack' } },
        select: { channels: true },
      }),
    ])

  const memberMap: Record<string, string> = {}
  for (const m of members) memberMap[m.userId] = m.displayName

  function serializeStatus(s: typeof notionStatus) {
    if (!s) return null
    return {
      ...s,
      lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
      nextSyncAt: s.nextSyncAt?.toISOString() ?? null,
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Capture Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Control what Neuron captures and how often.</p>
      </div>
      <CaptureSettingsClient
        canManage={canManage}
        notionRules={notionRules.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        slackRules={slackRules.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        notionStatus={serializeStatus(notionStatus)}
        slackStatus={serializeStatus(slackStatus)}
        recentLogs={recentLogs.map((l) => ({ ...l, timestamp: l.timestamp.toISOString() }))}
        memberMap={memberMap}
        slackChannels={integration?.channels ?? []}
      />
    </div>
  )
}
