import { WebClient, ErrorCode } from '@slack/web-api'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import type { SlackMessage } from '@/types'

export interface SlackSyncFetchResult {
  messages: SlackMessage[]
  channelsDiscovered: number
  channelsScanned: number
  channelsSkipped: number
  skippedReasons: Record<string, number>
}

function incrementReason(target: Record<string, number>, reason: string, count = 1) {
  target[reason] = (target[reason] ?? 0) + count
}

async function fetchWithRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err: unknown) {
    const slackErr = err as { code?: string; retryAfter?: number }
    if (slackErr?.code === ErrorCode.RateLimitedError) {
      const wait = (slackErr.retryAfter ?? 1) * 1000
      await new Promise((r) => setTimeout(r, wait))
      return fn()
    }
    throw err
  }
}

async function discoverChannels(client: WebClient): Promise<string[]> {
  const channelIds: string[] = []
  let cursor: string | undefined

  do {
    const page = await fetchWithRateLimitRetry(() =>
      client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200,
        cursor,
      })
    )

    for (const ch of page.channels ?? []) {
      if (ch.id && ch.is_member) channelIds.push(ch.id)
    }

    cursor = page.response_metadata?.next_cursor ?? undefined
  } while (cursor)

  return channelIds
}

const BENIGN_JOIN_ERRORS = new Set([
  'already_in_channel',
  'method_not_supported_for_channel_type',
])

async function fetchChannelMessages(
  client: WebClient,
  channelId: string,
  skippedReasons: Record<string, number>,
  oldest?: string,
): Promise<SlackMessage[]> {
  try {
    await fetchWithRateLimitRetry(() =>
      client.conversations.join({ channel: channelId })
    )
  } catch (err: unknown) {
    const code = (err as { data?: { error?: string } }).data?.error ?? 'unknown'
    if (!BENIGN_JOIN_ERRORS.has(code)) {
      console.error(`[slack/sync] Cannot join channel ${channelId} (${code}), skipping`)
      incrementReason(skippedReasons, `channel_join_${code}`)
      return []
    }
  }

  const messages: SlackMessage[] = []
  let cursor: string | undefined

  do {
    const page = await fetchWithRateLimitRetry(() =>
      client.conversations.history({
        channel: channelId,
        limit: 200,
        cursor,
        ...(oldest ? { oldest } : {}),
      })
    )

    for (const msg of page.messages ?? []) {
      if (!msg.text?.trim()) {
        incrementReason(skippedReasons, 'empty_or_system_message')
        continue
      }
      if (msg.bot_id || msg.subtype === 'bot_message') {
        incrementReason(skippedReasons, 'bot_message')
        continue
      }
      messages.push({
        text: msg.text,
        user: msg.user ?? 'unknown',
        channel: channelId,
        ts: msg.ts ?? '',
      })
    }

    cursor = page.response_metadata?.next_cursor ?? undefined
  } while (cursor)

  return messages
}

export async function syncSlackMessagesDetailed(workspaceId: string): Promise<SlackSyncFetchResult> {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_type: { workspaceId, type: 'slack' } },
  })

  if (!integration) throw new Error('No Slack integration found')

  const accessToken = decrypt(integration.accessToken)
  const client = new WebClient(accessToken)
  const skippedReasons: Record<string, number> = {}

  const channelIds = integration.channels.length > 0
    ? integration.channels
    : await discoverChannels(client)

  // On first sync use a 90-day window; on subsequent syncs fetch since lastSyncAt
  const NINETY_DAYS_AGO = String(Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000))
  const oldest = integration.lastSyncAt
    ? String(Math.floor(integration.lastSyncAt.getTime() / 1000))
    : NINETY_DAYS_AGO

  const allMessages: SlackMessage[] = []
  let channelsScanned = 0

  for (const channelId of channelIds) {
    channelsScanned++
    const messages = await fetchChannelMessages(client, channelId, skippedReasons, oldest)
    allMessages.push(...messages)
  }

  if (channelIds.length === 0) {
    incrementReason(skippedReasons, 'no_joined_channels')
  }
  if (channelIds.length > 0 && allMessages.length === 0) {
    incrementReason(skippedReasons, 'no_recent_human_messages')
  }

  return {
    messages: allMessages,
    channelsDiscovered: channelIds.length,
    channelsScanned,
    channelsSkipped: channelIds.length - channelsScanned,
    skippedReasons,
  }
}

export async function syncSlackMessages(workspaceId: string): Promise<SlackMessage[]> {
  const result = await syncSlackMessagesDetailed(workspaceId)
  return result.messages
}
