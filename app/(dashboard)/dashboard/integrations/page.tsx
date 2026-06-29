import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Card } from '@/components/ui/card'
import { CheckCircle } from 'lucide-react'
import Link from 'next/link'
import SyncButton from './SyncButton'
import GmailIntegrationCard, { type GmailMetadata } from './GmailIntegrationCard'
import NotionIntegrationCard from './NotionIntegrationCard'
import GranolaIntegrationCard from './GranolaIntegrationCard'
import DiscordIntegrationCard from './DiscordIntegrationCard'
import TelegramIntegrationCard from './TelegramIntegrationCard'
import WhatsAppIntegrationCard from './WhatsAppIntegrationCard'
import { BrandTile } from '@/components/BrandLogo'
import { StatusBadge, ResetLink, IntegrationViewLink, integrationConnectClass } from './IntegrationCardUi'
import { isIntegrationConnected } from '@/lib/integrations/connection'
import { getConnectedIntegrationToken } from '@/lib/integrations/connection-server'
import { getTelegramWebhookUrl, isTelegramConfigured } from '@/lib/telegram/config'

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
const notionOAuthAdminMessage =
  'Notion OAuth client mismatch. Check NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, and redirect URI in Vercel/Notion.'
const notionOAuthMismatchReasons = new Set([
  'invalid_client',
  'invalid_request',
  'unauthorized_client',
  'invalid_grant',
  'token_exchange',
])

export default async function IntegrationsPage(
  props: {
    searchParams: Promise<{ success?: string; error?: string; connected?: string; reason?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: {
      workspace: {
        include: {
          integrations: true,
          owner: { select: { clerkId: true } },
        },
      },
    },
  })

  const workspaceId = user?.workspace?.id
  const slack = user?.workspace?.integrations.find((i) => i.type === 'slack') ?? null
  const notion = user?.workspace?.integrations.find((i) => i.type === 'notion') ?? null
  const linear = user?.workspace?.integrations.find((i) => i.type === 'linear') ?? null
  const gmail = user?.workspace?.integrations.find((i) => i.type === 'gmail') ?? null
  const granola = user?.workspace?.integrations.find((i) => i.type === 'granola') ?? null
  const discord = user?.workspace?.integrations.find((i) => i.type === 'discord') ?? null
  const telegram = user?.workspace?.integrations.find((i) => i.type === 'telegram') ?? null
  const whatsapp = user?.workspace?.integrations.find((i) => i.type === 'whatsapp') ?? null
  const slackConnected = isIntegrationConnected(slack)
  const notionConnected = Boolean(getConnectedIntegrationToken(notion, {
    currentUserId: userId,
    workspaceType: user?.workspace?.type,
    workspaceOwnerClerkId: user?.workspace?.owner.clerkId,
  }))
  const linearConnected = isIntegrationConnected(linear)
  const gmailConnected = isIntegrationConnected(gmail)
  const granolaConnected = isIntegrationConnected(granola)
  const discordConnected = isIntegrationConnected(discord)
  const telegramConfigured = isTelegramConfigured()
  const telegramConnected = telegramConfigured && Boolean(telegram?.channels.length)
  const whatsappConnected = isIntegrationConnected(whatsapp)

  let pageCount = 0
  let syncedByName: string | null = null
  let lastSyncedAt: Date | null = notion?.lastSyncAt ?? null

  if (workspaceId && notionConnected) {
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
      {searchParams.connected === 'notion' && <SuccessBanner>Notion connected. Choose Sync Now when you are ready to import pages.</SuccessBanner>}
      {searchParams.success === 'discord' && <SuccessBanner>Discord connected. Choose Sync Now to import messages.</SuccessBanner>}
      {searchParams.connected === 'granola' && <SuccessBanner>Granola connected. Choose Sync Now to import meeting notes.</SuccessBanner>}
      {searchParams.connected === 'whatsapp' && <SuccessBanner>WhatsApp Business connected. New inbound messages will import through the webhook.</SuccessBanner>}
      {searchParams.error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-800">
            {searchParams.error === 'slack_failed' && 'Slack connection failed. Please try again.'}
            {searchParams.error === 'linear_failed' && 'Linear connection failed. Please try again.'}
            {searchParams.error === 'gmail_failed' && 'Gmail connection failed. Please try again.'}
            {searchParams.error === 'notion_failed' && (
              searchParams.reason && notionOAuthMismatchReasons.has(searchParams.reason)
                ? process.env.NODE_ENV === 'development'
                  ? `${notionOAuthAdminMessage} For local development, update .env.local and restart the development server.`
                  : notionOAuthAdminMessage
                : 'Notion connection failed. Please try again.'
            )}
            {searchParams.error === 'notion_not_configured' && (
              process.env.NODE_ENV === 'development'
                ? 'Notion OAuth is not configured locally. Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET to .env.local, then restart the development server.'
                : 'Notion is not configured yet. Please contact support.'
            )}
            {searchParams.error === 'notion_forbidden' && 'You do not have permission to connect Notion.'}
            {searchParams.error === 'discord_failed' && 'Discord connection failed. Please try again.'}
            {searchParams.error === 'discord_not_configured' && (
              process.env.NODE_ENV === 'development'
                ? 'Discord is not configured locally. Add DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, and DISCORD_REDIRECT_URI to .env.local, then restart the development server.'
                : 'Discord is not configured yet. Please contact support.'
            )}
            {searchParams.error === 'granola_failed' && 'Granola connection failed. Please try again.'}
            {searchParams.error === 'whatsapp_failed' && 'WhatsApp Business connection failed. Please try again.'}
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

      {/* One card per row, full width — Slack, Linear, Gmail, Notion stacked */}
      <div className="grid grid-cols-1 gap-6">
        {/* Slack */}
        <Card padding="md" className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <BrandTile brand="slack" className="h-12 w-12" />
              <div className="min-w-0">
                <h3 className="text-lg font-display font-semibold text-ink">Slack</h3>
                <p className="text-xs text-muted mt-0.5 truncate">
                  {slackConnected && slack ? `Connected to ${slack.teamName ?? 'your workspace'}` : 'Connect your Slack workspace'}
                </p>
              </div>
            </div>
            <StatusBadge connected={slackConnected} />
          </div>

          <div className="mt-5 flex-1 text-sm text-muted">
            {slackConnected && slack ? (
              <div className="space-y-3">
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
              <p>
                Neuron reads your Slack messages and extracts rules, decisions, processes, and ideas automatically.
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
            {slackConnected ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <IntegrationViewLink href="/dashboard/integrations/slack" />
                  <SyncButton endpoint="/api/integrations/slack/sync" resultLabel="messages" hideReset />
                </div>
                <ResetLink resetType="slack" />
              </>
            ) : (
              <a href="/api/integrations/slack/connect" className={integrationConnectClass}>Connect</a>
            )}
          </div>
        </Card>

        {/* Linear */}
        <Card padding="md" className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <BrandTile brand="linear" className="h-12 w-12" />
              <div className="min-w-0">
                <h3 className="text-lg font-display font-semibold text-ink">Linear</h3>
                <p className="text-xs text-muted mt-0.5 truncate">
                  {linearConnected ? 'Connected — issues synced to knowledge base' : 'Sync issues from your Linear workspace'}
                </p>
              </div>
            </div>
            <StatusBadge connected={linearConnected} />
          </div>

          <div className="mt-5 flex-1 text-sm text-muted">
            {linearConnected && linear ? (
              <div className="grid grid-cols-2 gap-3">
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
            ) : (
              <p>
                Neuron reads Linear issues, comments, projects, and status changes and classifies them for semantic search.
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-warm/60 pt-4">
            {linearConnected ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <IntegrationViewLink href="/dashboard/integrations/linear" />
                  <SyncButton endpoint="/api/integrations/linear/sync" resultLabel="issues" hideReset />
                </div>
                <ResetLink resetType="linear" />
              </>
            ) : (
              <a href="/api/integrations/linear/connect" className={integrationConnectClass}>Connect</a>
            )}
          </div>
        </Card>

        <GmailIntegrationCard
          createdAt={gmail?.createdAt.toISOString() ?? null}
          lastSyncAt={gmail?.lastSyncAt?.toISOString() ?? null}
          metadata={gmail?.metadata as GmailMetadata | null}
          connected={gmailConnected}
          autoOpenSetup={searchParams.connected === 'gmail'}
        />

        <NotionIntegrationCard
          connected={notionConnected}
          workspaceId={workspaceId}
          pageCount={pageCount}
          hasSynced={Boolean(notion?.lastSyncAt)}
          lastSyncedLabel={lastSyncedAt ? timeAgo(lastSyncedAt) : 'Never'}
          syncedByName={syncedByName}
        />

        <GranolaIntegrationCard
          createdAt={granola?.createdAt.toISOString() ?? null}
          lastSyncAt={granola?.lastSyncAt?.toISOString() ?? null}
          connected={granolaConnected}
          autoOpenSetup={searchParams.connected === 'granola-setup'}
        />

        <DiscordIntegrationCard
          connected={discordConnected}
          teamName={discord?.teamName ?? null}
          createdAt={discord?.createdAt.toISOString() ?? null}
          lastSyncAt={discord?.lastSyncAt?.toISOString() ?? null}
        />

        <TelegramIntegrationCard
          connected={telegramConnected}
          configured={telegramConfigured}
          webhookUrl={getTelegramWebhookUrl()}
          createdAt={telegram?.createdAt.toISOString() ?? null}
          lastSyncAt={telegram?.lastSyncAt?.toISOString() ?? null}
        />

        <div className="relative overflow-hidden rounded-xl">
          <div className="pointer-events-none opacity-45" aria-hidden="true" inert>
            <WhatsAppIntegrationCard
              connected={whatsappConnected}
              teamName={whatsapp?.teamName ?? null}
              createdAt={whatsapp?.createdAt.toISOString() ?? null}
              lastSyncAt={whatsapp?.lastSyncAt?.toISOString() ?? null}
              autoOpenSetup={false}
            />
          </div>
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/35 backdrop-blur-[2px]">
            <span className="rounded-full border border-warm bg-white px-5 py-2 text-sm font-semibold text-ink shadow-soft">
              Coming soon
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
