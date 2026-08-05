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
import TeamsIntegrationCard from './TeamsIntegrationCard'
import JiraIntegrationCard from './JiraIntegrationCard'
import WhatsAppIntegrationCard from './WhatsAppIntegrationCard'
import DatatruckIntegrationCard from './DatatruckIntegrationCard'
import TtEldIntegrationCard from './TtEldIntegrationCard'
import UpcomingIntegrationCard from './UpcomingIntegrationCard'
import SlackIntegrationCard from './SlackIntegrationCard'
import { BrandTile } from '@/components/BrandLogo'
import { StatusBadge, ResetLink, IntegrationViewLink, DisconnectIntegrationButton, integrationConnectClass } from './IntegrationCardUi'
import { isIntegrationConnected } from '@/lib/integrations/connection'
import { getNotionOAuthMismatchMessage } from '@/lib/notion/oauth'
import { getGmailOAuthFailureMessage } from '@/lib/gmail/oauth'
import { isGmailIntegrationEnabled, isGmailPublicEnabled, isGmailTestUser } from '@/lib/gmail/access'
import { getConnectedIntegrationToken } from '@/lib/integrations/connection-server'
import { getTelegramBotUsername, isTelegramConfigured } from '@/lib/telegram/config'

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

function IntegrationSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        <div className="h-px flex-1 bg-warm/70" />
      </div>
      {description ? <p className="-mt-2 text-sm text-muted">{description}</p> : null}
      <div className="grid grid-cols-1 gap-6">
        {children}
      </div>
    </section>
  )
}

const statTileClass = 'bg-cream rounded-xl px-3.5 py-2.5 border border-warm/60'
const notionOAuthMismatchReasons = new Set([
  'invalid_client',
  'invalid_request',
  'unauthorized_client',
  'invalid_grant',
  'token_exchange',
])

async function loadDatatruckConnector(workspaceId: string | undefined) {
  if (!workspaceId) return null
  try {
    const rows = await prisma.$queryRaw<Array<{ status: string; authType: string; createdAt: Date; lastSyncAt: Date | null; metadata: unknown }>>`
      SELECT "status", "authType", "createdAt", "lastSyncAt", "metadata"
      FROM "ApiConnector"
      WHERE "workspaceId" = ${workspaceId} AND "sourceKey" = 'datatruck'
      LIMIT 1
    `
    return rows[0] ?? null
  } catch {
    return null
  }
}

async function loadTtEldConnector(workspaceId: string | undefined) {
  if (!workspaceId) return null
  try {
    return await prisma.apiConnector.findUnique({
      where: { workspaceId_sourceKey: { workspaceId, sourceKey: 'five_eld' } },
      select: { status: true, lastSyncAt: true, metadata: true },
    })
  } catch { return null }
}

async function loadTelegramAccount(workspaceId: string | undefined, userId: string) {
  if (!workspaceId) return null
  // A long-running dev server can temporarily retain a Prisma Client generated
  // before the additive Telegram models existed. Keep Integrations usable until
  // that process is restarted; Account Sync remains unavailable in that state.
  const delegate = (prisma as typeof prisma & {
    telegramAccountConnection?: typeof prisma.telegramAccountConnection
  }).telegramAccountConnection
  if (!delegate) return null
  try {
    return await delegate.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: {
        status: true,
        externalDisplayName: true,
        externalUsername: true,
        lastSyncAt: true,
        _count: { select: { selectedChats: { where: { selected: true, syncEnabled: true } } } },
      },
    })
  } catch {
    return null
  }
}

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
  const slackUser = workspaceId ? await prisma.slackUserConnection.findUnique({
    where: { workspaceId_connectedByUserId: { workspaceId, connectedByUserId: userId } },
    select: {
      teamName: true,
      externalUserName: true,
      lastSyncAt: true,
      scopes: true,
      settings: true,
      _count: {
        select: {
          selectedConversations: {
            where: { selected: true, syncEnabled: true },
          },
        },
      },
    },
  }) : null
  const notion = user?.workspace?.integrations.find((i) => i.type === 'notion') ?? null
  const linear = user?.workspace?.integrations.find((i) => i.type === 'linear') ?? null
  const gmail = user?.workspace?.integrations.find((i) => i.type === 'gmail') ?? null
  const granola = user?.workspace?.integrations.find((i) => i.type === 'granola') ?? null
  const discord = user?.workspace?.integrations.find((i) => i.type === 'discord') ?? null
  const telegram = user?.workspace?.integrations.find((i) => i.type === 'telegram') ?? null
  const telegramAccount = await loadTelegramAccount(workspaceId, userId)
  const teams = user?.workspace?.integrations.find((i) => i.type === 'teams') ?? null
  const jira = user?.workspace?.integrations.find((i) => i.type === 'jira') ?? null
  const whatsapp = user?.workspace?.integrations.find((i) => i.type === 'whatsapp') ?? null
  const datatruck = await loadDatatruckConnector(workspaceId)
  const ttEld = await loadTtEldConnector(workspaceId)
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
  const teamsConnected = isIntegrationConnected(teams)
  const teamsMetadata = teams?.metadata && typeof teams.metadata === 'object' && !Array.isArray(teams.metadata)
    ? teams.metadata as Record<string, unknown>
    : {}
  const teamsNeedsReconnect = teamsMetadata.status === 'needs_reconnect'
  const teamsAdminConsentRequired = teamsMetadata.status === 'admin_consent_required' || searchParams.error === 'teams_admin_consent_required'
  const teamsSyncEnabled = teamsMetadata.connectionLevel === 'teams'
  const jiraConnected = isIntegrationConnected(jira)
  const jiraMetadata = jira?.metadata && typeof jira.metadata === 'object' && !Array.isArray(jira.metadata)
    ? jira.metadata as Record<string, unknown>
    : {}
  const jiraNeedsReconnect = jiraMetadata.status === 'needs_reconnect'
  const jiraPermissionIssue = jiraMetadata.status === 'permission_issue'
  const whatsappConnected = isIntegrationConnected(whatsapp)
  const datatruckMetadata = datatruck?.metadata && typeof datatruck.metadata === 'object' && !Array.isArray(datatruck.metadata)
    ? datatruck.metadata as Record<string, unknown>
    : {}
  const datatruckCompanyName = typeof datatruckMetadata.companyName === 'string' ? datatruckMetadata.companyName : null
  const datatruckConnectionMode = datatruck?.authType === 'full_account' ? 'full_account' as const : 'open_api' as const
  const datatruckFullAccountEnabled = process.env.DATATRUCK_FULL_ACCOUNT_CONNECTOR_ENABLED === 'true'
  const upcomingIntegrationTestingEnabled = process.env.ENABLE_UPCOMING_INTEGRATION_TESTING === 'true'
  const gmailIntegrationEnabled = isGmailIntegrationEnabled()
  const gmailPublicEnabled = isGmailPublicEnabled()
  const gmailBetaUser = isGmailTestUser(user?.email)
  const gmailClientConfigured = Boolean(process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)
  const gmailSecretConfigured = Boolean(process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)
  const gmailMissingEnv = [
    !gmailIntegrationEnabled ? 'GMAIL_INTEGRATION_ENABLED=true' : null,
    !gmailClientConfigured ? 'GMAIL_CLIENT_ID' : null,
    !gmailSecretConfigured ? 'GMAIL_CLIENT_SECRET' : null,
  ].filter((value): value is string => Boolean(value))
  const ttEldMetadata = ttEld?.metadata && typeof ttEld.metadata === 'object' && !Array.isArray(ttEld.metadata) ? ttEld.metadata as Record<string, unknown> : {}
  const ttEldCounts = ttEldMetadata.counts && typeof ttEldMetadata.counts === 'object' && !Array.isArray(ttEldMetadata.counts) ? ttEldMetadata.counts as Record<string, number> : {}
  // Legacy connector statuses (e.g. needs_endpoint_mapping) fall back to the connect flow.
  const datatruckStatus = datatruck?.status === 'connected'
    ? 'connected' as const
    : datatruck?.status === 'sync_error'
      ? 'sync_error' as const
      : 'not_connected' as const

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
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-3xl font-display font-semibold text-ink">Integrations</h1>
        <p className="text-sm text-muted mt-1">Connect the tools your team already uses. Neuron turns them into your company brain.</p>
      </div>

      {searchParams.success === 'slack' && <SuccessBanner>Slack connected successfully.</SuccessBanner>}
      {searchParams.success === 'slack_user' && <SuccessBanner>Personal Slack Access connected. Choose the conversations Neuron should sync.</SuccessBanner>}
      {(searchParams.success === 'linear' || searchParams.connected === 'linear') && (
        <SuccessBanner>Linear connected successfully.</SuccessBanner>
      )}
      {searchParams.connected === 'gmail' && <SuccessBanner>Gmail connected successfully.</SuccessBanner>}
      {searchParams.connected === 'notion' && <SuccessBanner>Notion connected. Choose Sync Now when you are ready to import pages.</SuccessBanner>}
      {searchParams.success === 'discord' && <SuccessBanner>Discord connected. Choose Sync Now to import messages.</SuccessBanner>}
      {searchParams.connected === 'microsoft' && <SuccessBanner>Microsoft account connected.</SuccessBanner>}
      {searchParams.connected === 'teams' && <SuccessBanner>Teams message sync connected. Choose Sync Now to import recent channel messages.</SuccessBanner>}
      {searchParams.connected === 'jira' && <SuccessBanner>Jira connected. Choose Sync Now to import recent issues and comments.</SuccessBanner>}
      {searchParams.connected === 'granola' && <SuccessBanner>Granola connected. Choose Sync Now to import meeting notes.</SuccessBanner>}
      {searchParams.connected === 'whatsapp' && <SuccessBanner>WhatsApp Business connected. New inbound messages will import through the webhook.</SuccessBanner>}
      {searchParams.error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <div className="text-sm text-red-800">
            {searchParams.error === 'slack_failed' && 'Slack connection failed. Please try again.'}
            {searchParams.error === 'slack_admin_approval' && 'Your Slack workspace requires admin approval for Personal Slack Access. Admin request: Please approve the Neuron Slack app for channel history, private-channel history, and optional DM history scopes. Neuron only reads conversations the connecting user can access.'}
            {searchParams.error === 'slack_distribution_required' && (
              <span className="space-y-2">
                <span className="block font-medium">This Slack app is not distributed yet. For local testing, authorize it in the same Slack workspace where the app was created. For other workspaces, enable Slack app distribution in the Slack API dashboard.</span>
                <span className="block">Setup checklist:</span>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Open api.slack.com/apps and select the Neuron Slack app.</li>
                  <li>Confirm the app was created in the workspace you are authorizing.</li>
                  <li>Add both callback URLs: http://localhost:3000/api/integrations/slack/callback and https://app.tryneuron.net/api/integrations/slack/callback.</li>
                  <li>For customer workspaces, enable Manage Distribution / Public Distribution.</li>
                  <li>Reinstall or re-authorize the app.</li>
                </ol>
              </span>
            )}
            {searchParams.error === 'linear_failed' && 'Linear connection failed. Please try again.'}
            {searchParams.error === 'gmail_failed' && getGmailOAuthFailureMessage(searchParams.reason)}
            {searchParams.error === 'notion_failed' && (
              searchParams.reason && notionOAuthMismatchReasons.has(searchParams.reason)
                ? getNotionOAuthMismatchMessage()
                : 'Notion connection failed. Please try again.'
            )}
            {searchParams.error === 'notion_not_configured' && (
              process.env.NODE_ENV === 'development'
                ? 'Notion OAuth is not configured locally. Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET to .env.local, then restart the development server.'
                : 'Notion is not configured yet. Please contact support.'
            )}
            {searchParams.error === 'notion_forbidden' && 'You do not have permission to connect Notion.'}
            {searchParams.error === 'discord_failed' && 'Discord connection failed. Please try again.'}
            {searchParams.error === 'teams_admin_consent_required' && (
              'Your Microsoft organization requires administrator approval. Ask your Microsoft 365 administrator to approve Neuron, or try another Microsoft account.'
            )}
            {searchParams.error === 'teams_failed' && (
              searchParams.reason === 'token_exchange_failed'
                ? 'Microsoft Teams connection failed during token exchange. Check Azure app redirect URI and client secret.'
                : 'Microsoft Teams connection failed. Please try again.'
            )}
            {searchParams.error === 'jira_failed' && (
              searchParams.reason === 'no_accessible_resources'
                ? 'Jira connected, but no accessible Jira Cloud site was returned. Check Atlassian app permissions.'
                : searchParams.reason === 'token_exchange_failed'
                  ? 'Jira connection failed during token exchange. Check Atlassian redirect URI and client secret.'
                  : 'Jira connection failed. Please try again.'
            )}
            {searchParams.error === 'discord_not_configured' && (
              process.env.NODE_ENV === 'development'
                ? 'Discord is not configured locally. Add DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, and DISCORD_REDIRECT_URI to .env.local, then restart the development server.'
                : 'Discord is not configured yet. Please contact support.'
            )}
            {searchParams.error === 'granola_failed' && 'Granola connection failed. Please try again.'}
            {searchParams.error === 'whatsapp_failed' && 'WhatsApp Business connection failed. Please try again.'}
            {searchParams.error === 'no_workspace' && 'No workspace found. Please contact support.'}
          </div>
        </div>
      )}

      <IntegrationSection title="General">
        <SlackIntegrationCard
          botConnection={slackConnected && slack ? {
            teamName: slack.teamName,
            createdAt: slack.createdAt.toISOString(),
            lastSyncAt: slack.lastSyncAt?.toISOString() ?? null,
            channels: slack.channels,
          } : null}
          userConnection={slackUser ? {
            teamName: slackUser.teamName,
            externalUserName: slackUser.externalUserName,
            lastSyncAt: slackUser.lastSyncAt?.toISOString() ?? null,
            scopes: slackUser.scopes,
            selectedCount: slackUser._count.selectedConversations,
            settings: {
              publicChannels: !(slackUser.settings && typeof slackUser.settings === 'object' && !Array.isArray(slackUser.settings) && (slackUser.settings as Record<string, unknown>).publicChannels === false),
              privateChannels: Boolean(slackUser.settings && typeof slackUser.settings === 'object' && !Array.isArray(slackUser.settings) && (slackUser.settings as Record<string, unknown>).privateChannels === true),
              groupDms: Boolean(slackUser.settings && typeof slackUser.settings === 'object' && !Array.isArray(slackUser.settings) && (slackUser.settings as Record<string, unknown>).groupDms === true),
              dms: Boolean(slackUser.settings && typeof slackUser.settings === 'object' && !Array.isArray(slackUser.settings) && (slackUser.settings as Record<string, unknown>).dms === true),
              excludedConversationNames: slackUser.settings && typeof slackUser.settings === 'object' && !Array.isArray(slackUser.settings) && Array.isArray((slackUser.settings as Record<string, unknown>).excludedConversationNames)
                ? ((slackUser.settings as Record<string, unknown>).excludedConversationNames as unknown[]).filter((item): item is string => typeof item === 'string')
                : [],
            },
          } : null}
        />

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
                  <DisconnectIntegrationButton type="linear" />
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
          available={gmailIntegrationEnabled && (gmailPublicEnabled || gmailBetaUser) && gmailMissingEnv.length === 0}
          betaGated={!gmailPublicEnabled}
          betaUser={gmailBetaUser}
          missingEnv={gmailMissingEnv}
          autoOpenSetup={searchParams.connected === 'gmail' || searchParams.error === 'gmail_failed'}
          oauthBlocked={searchParams.error === 'gmail_failed' && ['missing_code', 'oauth_error', 'redirect_uri_mismatch', 'invalid_client', 'invalid_scope', 'insufficient_scope', 'org_internal'].includes(searchParams.reason ?? '')}
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
          botUsername={getTelegramBotUsername()}
          createdAt={telegram?.createdAt.toISOString() ?? null}
          lastSyncAt={telegram?.lastSyncAt?.toISOString() ?? null}
          publicImportEnabled={process.env.TELEGRAM_PUBLIC_IMPORT_ENABLED === 'true'}
          accountSyncEnabled={process.env.TELEGRAM_ACCOUNT_SYNC_ENABLED === 'true'}
          accountStatus={telegramAccount?.status ?? null}
          accountDisplayName={telegramAccount?.externalDisplayName ?? null}
          accountUsername={telegramAccount?.externalUsername ?? null}
          accountSelectedCount={telegramAccount?._count.selectedChats ?? 0}
          accountLastSyncAt={telegramAccount?.lastSyncAt?.toISOString() ?? null}
        />

        {upcomingIntegrationTestingEnabled ? <TeamsIntegrationCard
          connected={teamsConnected}
          teamsSyncEnabled={teamsSyncEnabled}
          needsReconnect={teamsNeedsReconnect}
          adminConsentRequired={teamsAdminConsentRequired}
          teamName={teams?.teamName ?? null}
          createdAt={teams?.createdAt.toISOString() ?? null}
          lastSyncAt={teams?.lastSyncAt?.toISOString() ?? null}
        /> : null}

        <JiraIntegrationCard
          connected={jiraConnected}
          needsReconnect={jiraNeedsReconnect}
          permissionIssue={jiraPermissionIssue}
          siteName={jira?.teamName ?? null}
          createdAt={jira?.createdAt.toISOString() ?? null}
          lastSyncAt={jira?.lastSyncAt?.toISOString() ?? null}
        />
      </IntegrationSection>

      <IntegrationSection title="Truck">
        <TtEldIntegrationCard
          status={ttEld?.status ?? 'not_connected'}
          usdot={typeof ttEldMetadata.usdot === 'string' ? ttEldMetadata.usdot : null}
          lastSyncAt={ttEld?.lastSyncAt?.toISOString() ?? null}
          counts={ttEldCounts}
        />
        <DatatruckIntegrationCard
          status={datatruckStatus}
          companyName={datatruckCompanyName}
          lastSyncAt={datatruck?.lastSyncAt?.toISOString() ?? null}
          connectionMode={datatruckConnectionMode}
          fullAccountEnabled={datatruckFullAccountEnabled}
        />
      </IntegrationSection>

      <IntegrationSection title="Upcoming">
        <p className="text-sm text-muted">These integrations are being prepared for public release. Some require third-party verification or admin approval before we can enable them for all workspaces.</p>
        {!upcomingIntegrationTestingEnabled ? (
          <>
            <UpcomingIntegrationCard
              brand="teams"
              name="Microsoft Teams"
              status="Admin approval required"
              description="Microsoft Teams integration requires organization admin approval for channel message access. We are improving the admin-consent flow before public release."
              buttonLabel="View requirements"
              modalTitle="Microsoft Teams is coming soon"
              modalCopy="Microsoft organizations often require administrator approval before apps can read Teams channel data. Neuron will support Teams after we finish the admin-consent setup flow."
              requirements={[
                { label: 'Microsoft Graph permissions', value: 'User.Read, Team.ReadBasic.All, Channel.ReadBasic.All, ChannelMessage.Read.All' },
                { label: 'Status', value: 'Admin approval flow pending' },
              ]}
              footer="Your Microsoft 365 admin may need to approve Neuron before Teams can connect."
            />
          </>
        ) : null}
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
      </IntegrationSection>
    </div>
  )
}
