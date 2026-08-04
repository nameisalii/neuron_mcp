import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Linkedin } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
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
    <div className="w-full max-w-6xl space-y-6">
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
      <section className="border-t border-gray-200 pt-8" aria-labelledby="feedback-heading">
        <div>
          <h2 id="feedback-heading" className="text-xl font-semibold text-gray-900">Feedback</h2>
          <p className="mt-1 text-sm text-gray-500">Have an idea or need help? Message us directly.</p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <a
            href="https://www.linkedin.com/messaging/"
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-36 items-center gap-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0A66C2] text-white">
              <Linkedin className="h-6 w-6" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-semibold text-gray-900">Message on LinkedIn</span>
              <span className="mt-1 block text-sm text-gray-600">Start a direct conversation with us.</span>
            </span>
          </a>
          <a
            href="mailto:team@tryneuon.net,alibekdinov@gmail.com?subject=Neuron%20feedback"
            className="group flex min-h-36 items-center gap-4 rounded-2xl border border-red-200 bg-red-50/60 p-5 transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
              <BrandLogo brand="gmail" className="h-7 w-7" />
            </span>
            <span>
              <span className="block font-semibold text-gray-900">Send an email</span>
              <span className="mt-1 block text-sm text-gray-600">Email the Neuron team with feedback or questions.</span>
            </span>
          </a>
        </div>
      </section>
    </div>
  )
}
