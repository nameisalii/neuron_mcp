import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Card } from '@/components/ui/card'
import { CheckCircle } from 'lucide-react'
import Link from 'next/link'
import SyncButton from './SyncButton'
import GmailIntegrationCard, { type GmailMetadata } from './GmailIntegrationCard'
import NotionIntegrationCard from './NotionIntegrationCard'
import { BrandTile } from '@/components/BrandLogo'
import { ConnectedBadge, IntegrationViewLink, NotConnectedBadge, integrationConnectClass } from './IntegrationCardUi'

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return date.toLocaleDateString()
}

function SuccessBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-[#E6F2EC] border border-positive/20 rounded-xl">
      <CheckCircle className="w-4 h-4 text-positive shrink-0" />
      <p className="text-sm text-positive">{children}</p>
    </div>
  )
}

const statTileClass = 'bg-cream rounded-xl px-3.5 py-2.5 border border-warm/60'

export default async function IntegrationsPage(
  props: {
    searchParams: Promise<{ success?: string; error?: string; connected?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { workspace: { include: { integrations: true } } },
  })

  const workspaceId = user?.workspace?.id
  const slack = user?.workspace?.integrations.find((i) => i.type === 'slack') ?? null
  const notion = user?.workspace?.integrations.find((i) => i.type === 'notion') ?? null
  const linear = user?.workspace?.integrations.find((i) => i.type === 'linear') ?? null
  const gmail = user?.workspace?.integrations.find((i) => i.type === 'gmail') ?? null

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
      <div>
        <h1 className="text-3xl font-display font-semibold text-ink">Integrations</h1>
        <p className="text-sm text-muted mt-1">Connect your tools so Neuron can capture and organize your team&apos;s knowledge.</p>
      </div>

      {searchParams.success === 'slack' && <SuccessBanner>Slack connected successfully.</SuccessBanner>}
      {(searchParams.success === 'linear' || searchParams.connected === 'linear') && (
        <SuccessBanner>Linear connected successfully.</SuccessBanner>
      )}
      {searchParams.connected === 'gmail' && <SuccessBanner>Gmail connected successfully.</SuccessBanner>}
      {searchParams.error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-800">
            {searchParams.error === 'slack_failed' && 'Slack connection failed. Please try again.'}
            {searchParams.error === 'linear_failed' && 'Linear connection failed. Please try again.'}
            {searchParams.error === 'gmail_failed' && 'Gmail connection failed. Please try again.'}
            {searchParams.error === 'no_workspace' && 'No workspace found. Please contact support.'}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Link
          href="/dashboard/email-preview"
          className="px-3 py-1.5 rounded-[10px] border border-warm text-sm text-muted hover:bg-white hover:text-ink transition-colors"
        >
          Email Preview
        </Link>
      </div>

      {/* Slack */}
      <Card padding="md">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5 min-w-0">
            <BrandTile brand="slack" className="w-12 h-12" />
            <div className="min-w-0">
              <h3 className="text-lg font-display font-semibold text-ink">Slack</h3>
              <p className="text-xs text-muted mt-0.5 truncate">
                {slack ? `Connected to ${slack.teamName ?? 'your workspace'}` : 'Connect your Slack workspace'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {slack ? (
              <>
                <IntegrationViewLink href="/dashboard/integrations/slack" />
                <SyncButton endpoint="/api/integrations/slack/sync" showReset resetType="slack" resultLabel="messages" />
                <ConnectedBadge />
              </>
            ) : (
              <>
                <a href="/api/integrations/slack/connect" className={integrationConnectClass}>Connect</a>
                <NotConnectedBadge />
              </>
            )}
          </div>
        </div>
        {slack ? (
          <div className="mt-5 space-y-3 text-sm text-muted">
            <div className="grid grid-cols-2 gap-3">
              <div className={statTileClass}>
                <p className="text-xs text-muted mb-0.5">Connected</p>
                <p className="font-medium text-ink">{slack.createdAt.toLocaleDateString()}</p>
              </div>
              <div className={statTileClass}>
                <p className="text-xs text-muted mb-0.5">Last synced</p>
                <p className="font-medium text-ink">
                  {slack.lastSyncAt ? slack.lastSyncAt.toLocaleDateString() : 'Never'}
                </p>
              </div>
            </div>
            {slack.channels.length > 0 && (
              <div>
                <p className="text-xs text-muted mb-1.5">Monitored channels ({slack.channels.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {slack.channels.map((ch) => (
                    <span key={ch} className="px-2 py-0.5 rounded-md text-xs bg-accent-soft text-navy font-mono">
                      #{ch}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted mt-4">
            Neuron reads your Slack messages and extracts rules, decisions, processes, and ideas automatically.
          </p>
        )}
      </Card>

      {/* Linear */}
      <Card padding="md">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5 min-w-0">
            <BrandTile brand="linear" className="w-12 h-12" />
            <div className="min-w-0">
              <h3 className="text-lg font-display font-semibold text-ink">Linear</h3>
              <p className="text-xs text-muted mt-0.5 truncate">
                {linear ? 'Connected — issues synced to knowledge base' : 'Sync issues from your Linear workspace'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {linear ? (
              <>
                <IntegrationViewLink href="/dashboard/integrations/linear" />
                <SyncButton endpoint="/api/integrations/linear/sync" showReset resetType="linear" resultLabel="issues" />
                <ConnectedBadge />
              </>
            ) : (
              <>
                <a href="/api/integrations/linear/connect" className={integrationConnectClass}>Connect</a>
                <NotConnectedBadge />
              </>
            )}
          </div>
        </div>
        {linear && (
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className={statTileClass}>
              <p className="text-xs text-muted mb-0.5">Connected</p>
              <p className="font-medium text-ink">{linear.createdAt.toLocaleDateString()}</p>
            </div>
            <div className={statTileClass}>
              <p className="text-xs text-muted mb-0.5">Last synced</p>
              <p className="font-medium text-ink">
                {linear.lastSyncAt ? timeAgo(linear.lastSyncAt) : 'Never'}
              </p>
            </div>
          </div>
        )}
        {!linear && (
          <p className="text-sm text-muted mt-4">
            Neuron reads Linear issues, comments, projects, and status changes and classifies them for semantic search.
          </p>
        )}
      </Card>

      <GmailIntegrationCard
        createdAt={gmail?.createdAt.toISOString() ?? null}
        lastSyncAt={gmail?.lastSyncAt?.toISOString() ?? null}
        metadata={gmail?.metadata as GmailMetadata | null}
        autoOpenSetup={searchParams.connected === 'gmail'}
      />

      <NotionIntegrationCard
        connected={Boolean(notion)}
        workspaceId={workspaceId}
        pageCount={pageCount}
        lastSyncedLabel={lastSyncedAt ? timeAgo(lastSyncedAt) : 'Never'}
        syncedByName={syncedByName}
      />
    </div>
  )
}
