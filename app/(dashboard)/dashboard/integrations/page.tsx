import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, Slack, FileText, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import SyncButton from './SyncButton'
import NotionSyncButton from './NotionSyncButton'

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return date.toLocaleDateString()
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string }
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { workspace: { include: { integrations: true } } },
  })

  const workspaceId = user?.workspace?.id
  const slack = user?.workspace?.integrations.find((i) => i.type === 'slack') ?? null
  const notion = user?.workspace?.integrations.find((i) => i.type === 'notion') ?? null

  let pageCount = 0
  let syncedByName: string | null = null
  let lastSyncedAt: Date | null = notion?.lastSyncAt ?? null

  if (workspaceId && notion) {
    const [count, recentPage] = await Promise.all([
      prisma.notionPage.count({ where: { workspaceId } }),
      prisma.notionPage.findFirst({
        where: { workspaceId },
        orderBy: { syncedAt: 'desc' },
        select: { syncedBy: true, syncedAt: true },
      }),
    ])
    pageCount = count
    if (recentPage?.syncedBy) {
      lastSyncedAt = recentPage.syncedAt
      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: recentPage.syncedBy } },
        select: { displayName: true },
      })
      syncedByName = member?.displayName ?? null
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>

      {searchParams.success === 'slack' && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-md">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-800">Slack connected successfully.</p>
        </div>
      )}
      {searchParams.error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            {searchParams.error === 'slack_failed' && 'Slack connection failed. Please try again.'}
            {searchParams.error === 'no_workspace' && 'No workspace found. Please contact support.'}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Link
          href="/dashboard/email-preview"
          className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Email Preview
        </Link>
      </div>

      {/* Slack */}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#4A154B] flex items-center justify-center shrink-0">
                <Slack className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle>Slack</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  {slack ? `Connected to ${slack.teamName ?? 'your workspace'}` : 'Connect your Slack workspace'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {slack ? (
                <>
                  <SyncButton />
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    <CheckCircle className="w-3 h-3" />
                    Connected
                  </span>
                </>
              ) : (
                <a
                  href="/api/integrations/slack/connect"
                  className="px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                >
                  Connect
                </a>
              )}
            </div>
          </div>
        </CardHeader>
        {slack ? (
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Connected</p>
                <p className="font-medium text-gray-700">{slack.createdAt.toLocaleDateString()}</p>
              </div>
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Last synced</p>
                <p className="font-medium text-gray-700">
                  {slack.lastSyncAt ? slack.lastSyncAt.toLocaleDateString() : 'Never'}
                </p>
              </div>
            </div>
            {slack.channels.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Monitored channels ({slack.channels.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {slack.channels.map((ch) => (
                    <span key={ch} className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-mono">
                      #{ch}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-600 mt-1">
            Neuron reads your Slack messages and extracts rules, decisions, processes, and ideas automatically.
          </p>
        )}
      </Card>

      {/* Notion */}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                <Image src="/icons/notion.svg" alt="Notion" width={40} height={40} />
              </div>
              <div>
                <CardTitle>Notion</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  {notion ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                      Connected
                    </span>
                  ) : (
                    'Sync pages from your Notion workspace'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {notion && (
                <Link
                  href="/dashboard/notion"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Pages
                </Link>
              )}
              <NotionSyncButton workspaceId={workspaceId} />
            </div>
          </div>
        </CardHeader>

        {notion ? (
          <div className="mt-2 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Pages synced</p>
                <p className="font-semibold text-gray-800 text-base">{pageCount}</p>
              </div>
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Last synced</p>
                <p className="font-medium text-gray-700 text-xs leading-tight">
                  {lastSyncedAt ? timeAgo(lastSyncedAt) : 'Never'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">Synced by</p>
                <p className="font-medium text-gray-700 text-xs leading-tight truncate">
                  {syncedByName ?? '—'}
                </p>
              </div>
            </div>
            {lastSyncedAt && syncedByName && (
              <p className="text-xs text-gray-500">
                Last sync by <span className="font-medium text-gray-700">{syncedByName}</span>{' '}
                {timeAgo(lastSyncedAt)}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-gray-600">
              Neuron reads your Notion pages and chunks them for semantic search and labeling.
            </p>
            <p className="text-xs text-gray-400">
              Make sure your pages are shared with the Neuron connection (page ⋯ menu → Connections → Neuron).
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
