import { prisma } from '@/lib/db'
import { decrypt, encrypt } from '@/lib/crypto'
import { extractKnowledgeDetailed } from '@/lib/extraction/extractor'
import {
  SLACK_USER_SYNC_LOOKBACK_DAYS,
  SLACK_USER_SYNC_MAX_CONVERSATIONS,
  SLACK_USER_SYNC_MAX_MESSAGES_PER_CONVERSATION,
} from './constants'
import {
  createSlackUserClient,
  fetchConversationHistory,
  type SlackConversationType,
} from './userClient'

export async function activeSlackUserToken(connection: {
  id: string
  encryptedAccessToken: string
  encryptedRefreshToken: string | null
  tokenExpiresAt: Date | null
}): Promise<string> {
  const expiring = connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() <= Date.now() + 60_000
  if (!expiring) return decrypt(connection.encryptedAccessToken)
  if (!connection.encryptedRefreshToken) throw new Error('Slack token expired. Reconnect your Slack account.')
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Slack OAuth is not configured')
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decrypt(connection.encryptedRefreshToken),
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const payload = await response.json() as {
    ok?: boolean
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }
  if (!payload.ok || !payload.access_token) throw new Error('Slack token refresh failed. Reconnect your Slack account.')
  await prisma.slackUserConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encrypt(payload.access_token),
      encryptedRefreshToken: payload.refresh_token ? encrypt(payload.refresh_token) : connection.encryptedRefreshToken,
      tokenExpiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null,
    },
  })
  return payload.access_token
}

export interface SlackUserSyncSummary {
  conversationsDiscovered: number
  conversationsScanned: number
  messagesFetched: number
  knowledgeCreated: number
  skippedConversations: number
}

export async function syncSlackUserConnection(input: {
  workspaceId: string
  userId: string
  now?: Date
}): Promise<SlackUserSyncSummary> {
  const connection = await prisma.slackUserConnection.findUnique({
    where: {
      workspaceId_connectedByUserId: {
        workspaceId: input.workspaceId,
        connectedByUserId: input.userId,
      },
    },
  })
  if (!connection) throw new Error('No personal Slack connection found')

  const selected = await prisma.slackSelectedConversation.findMany({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      slackUserConnectionId: connection.id,
      selected: true,
      syncEnabled: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: SLACK_USER_SYNC_MAX_CONVERSATIONS,
  })
  if (selected.length === 0) {
    return {
      conversationsDiscovered: 0,
      conversationsScanned: 0,
      messagesFetched: 0,
      knowledgeCreated: 0,
      skippedConversations: 0,
    }
  }

  const client = createSlackUserClient(await activeSlackUserToken(connection))
  const now = input.now ?? new Date()
  const lookback = new Date(now.getTime() - SLACK_USER_SYNC_LOOKBACK_DAYS * 86_400_000)
  let messagesFetched = 0
  let knowledgeCreated = 0

  for (const conversation of selected) {
    const oldestDate = conversation.lastSyncedAt && conversation.lastSyncedAt > lookback
      ? conversation.lastSyncedAt
      : lookback
    const oldest = String(Math.floor(oldestDate.getTime() / 1000))
    const messages = await fetchConversationHistory({
      client,
      channelId: conversation.conversationId,
      oldest,
      maxMessages: SLACK_USER_SYNC_MAX_MESSAGES_PER_CONVERSATION,
    })
    if (messages.length === 0) {
      await prisma.slackSelectedConversation.update({
        where: { id: conversation.id },
        data: { lastSyncedAt: now },
      })
      continue
    }
    messagesFetched += messages.length
    const newestTs = messages[0]?.ts ?? oldest
    const type = conversation.conversationType as SlackConversationType
    const name = conversation.conversationName ?? 'Slack conversation'
    const visibility = conversation.visibility === 'team' ? 'team' : 'personal'
    const sourceUrl = `https://app.slack.com/client/${encodeURIComponent(connection.teamId)}/${encodeURIComponent(conversation.conversationId)}`
    const result = await extractKnowledgeDetailed(
      messages.map((message) => ({
        ...message,
        channel: type === 'public_channel' || type === 'private_channel'
          ? `#${name}`
          : type === 'mpim' ? name || 'Group DM' : name || 'Direct message',
        permalink: sourceUrl,
      })),
      input.workspaceId,
      'slack',
      sourceUrl,
      `user:${connection.externalUserId}:${conversation.conversationId}:${newestTs}`,
      undefined,
      {
        namespace: visibility === 'team' ? input.workspaceId : `${input.workspaceId}:${input.userId}`,
        visibility,
        visibilitySetBy: input.userId,
        sourceMetadata: {
          slackTeamId: connection.teamId,
          slackTeamName: connection.teamName,
          slackChannelId: conversation.conversationId,
          slackChannelName: name,
          channelName: type === 'public_channel' || type === 'private_channel' ? `#${name}` : name,
          conversationType: type,
          slackUserId: connection.externalUserId,
          messageTs: newestTs,
          connectionMode: 'user',
        },
      },
    )
    knowledgeCreated += result.items.length
    await prisma.slackSelectedConversation.update({
      where: { id: conversation.id },
      data: { lastSyncedAt: now, lastMessageAt: new Date(Number(newestTs) * 1000) },
    })
  }

  await prisma.slackUserConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: now, lastErrorCode: null },
  })
  return {
    conversationsDiscovered: selected.length,
    conversationsScanned: selected.length,
    messagesFetched,
    knowledgeCreated,
    skippedConversations: 0,
  }
}
