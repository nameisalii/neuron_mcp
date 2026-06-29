import { trackEvent } from '@/lib/activity'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import {
  listGuildChannels,
  getChannelMessages,
  READABLE_CHANNEL_TYPES,
  DiscordApiError,
  type DiscordMessage,
} from '@/lib/discord/api'
import type { SlackMessage } from '@/types'

// Bound the first sync: recent messages per channel and channels per run.
const MESSAGES_PER_CHANNEL = 100
const MAX_CHANNELS = 50
// Discord system/join messages have type !== 0 (DEFAULT) and !== 19 (REPLY).
const HUMAN_MESSAGE_TYPES = new Set([0, 19])

export interface DiscordSyncResult {
  success: boolean
  guildId: string
  channelsDiscovered: number
  channelsScanned: number
  messagesFetched: number
  processed: number
  knowledgeCreated: number
  knowledgeUpdated: number
  skipped: number
  skippedReasons: Record<string, number>
  extractionErrors: number
  embeddingErrors: number
  databaseErrors: number
  canReadMessages: boolean
  message?: string
}

interface DiscordSyncParams {
  workspaceId: string
  guildId: string
  botToken: string
  syncedBy: string
  syncedByName: string
}

const NO_ACCESS_MESSAGE =
  'Discord connected, but Neuron could not read messages. Make sure the bot has View Channel and Read Message History permissions.'

function incrementReason(target: Record<string, number>, reason: string): void {
  target[reason] = (target[reason] ?? 0) + 1
}

function isHumanMessage(message: DiscordMessage): boolean {
  if (message.author?.bot) return false
  if (!HUMAN_MESSAGE_TYPES.has(message.type)) return false
  return Boolean(message.content && message.content.trim())
}

function messageToSlackMessage(message: DiscordMessage, channelName: string): SlackMessage {
  return {
    text: message.content,
    user: message.author?.global_name || message.author?.username || 'member',
    channel: channelName,
    ts: String(new Date(message.timestamp).getTime() / 1000),
  }
}

function extractionErrorCount(diagnostics: ExtractionDiagnostics): number {
  return (
    diagnostics.extractorParseFailed +
    diagnostics.validationFailed +
    diagnostics.itemProcessingFailed
  )
}

export async function syncDiscord(params: DiscordSyncParams): Promise<DiscordSyncResult> {
  const { workspaceId, guildId, botToken, syncedBy, syncedByName } = params

  let channelsDiscovered = 0
  let channelsScanned = 0
  let messagesFetched = 0
  let processed = 0
  let knowledgeCreated = 0
  const knowledgeUpdated = 0
  let skipped = 0
  let extractionErrors = 0
  let embeddingErrors = 0
  let databaseErrors = 0
  let canReadMessages = false
  const skippedReasons: Record<string, number> = {}

  let channels
  try {
    channels = await listGuildChannels(botToken, guildId)
  } catch (err) {
    // 403/401 means the bot is not in the server or lacks View Channel.
    if (err instanceof DiscordApiError && (err.status === 403 || err.status === 401)) {
      return emptyResult(guildId, NO_ACCESS_MESSAGE)
    }
    throw err
  }

  const textChannels = channels.filter((channel) => READABLE_CHANNEL_TYPES.has(channel.type)).slice(0, MAX_CHANNELS)
  channelsDiscovered = textChannels.length

  for (const channel of textChannels) {
    const messages = await getChannelMessages(botToken, channel.id, { limit: MESSAGES_PER_CHANNEL })
    channelsScanned++

    const humanMessages = messages.filter((message) => {
      if (isHumanMessage(message)) return true
      incrementReason(skippedReasons, 'non_human_message')
      return false
    })
    messagesFetched += humanMessages.length
    if (humanMessages.length > 0) canReadMessages = true
    if (humanMessages.length === 0) continue

    const channelName = channel.name ?? channel.id
    const slackMessages = humanMessages.map((message) => messageToSlackMessage(message, channelName))
    const channelUrl = `https://discord.com/channels/${guildId}/${channel.id}`

    try {
      const result = await extractKnowledgeDetailed(
        slackMessages,
        workspaceId,
        'discord',
        channelUrl,
        channel.id,
      )
      knowledgeCreated += result.items.length
      extractionErrors += extractionErrorCount(result.diagnostics)
      embeddingErrors += result.diagnostics.embeddingUpsertFailed
      databaseErrors += result.diagnostics.knowledgeItemCreateFailed
      if (result.items.length === 0) {
        skipped++
        incrementReason(skippedReasons, 'no_extractable_knowledge')
      }
      processed++
    } catch {
      // Never log message content or channel names — count the failure only.
      databaseErrors++
      incrementReason(skippedReasons, 'channel_failed')
    }
  }

  await trackEvent(workspaceId, syncedBy, syncedByName, 'sync',
    `Synced ${messagesFetched} messages from Discord`,
    { integration: 'discord', action: 'completed', channelsScanned, messagesFetched, knowledgeCreated })

  // Counts only — no token, no message content, no channel names, no user PII.
  console.info('[discord/sync] summary', {
    workspaceId,
    integration: 'discord',
    guildId,
    channelsDiscovered,
    channelsScanned,
    messagesFetched,
    processed,
    knowledgeCreated,
    knowledgeUpdated,
    skipped,
    skippedReasons,
    extractionErrors,
    embeddingErrors,
    databaseErrors,
  })

  return {
    success: true,
    guildId,
    channelsDiscovered,
    channelsScanned,
    messagesFetched,
    processed,
    knowledgeCreated,
    knowledgeUpdated,
    skipped,
    skippedReasons,
    extractionErrors,
    embeddingErrors,
    databaseErrors,
    canReadMessages,
    message: messagesFetched === 0 ? NO_ACCESS_MESSAGE : undefined,
  }
}

function emptyResult(guildId: string, message: string): DiscordSyncResult {
  return {
    success: true,
    guildId,
    channelsDiscovered: 0,
    channelsScanned: 0,
    messagesFetched: 0,
    processed: 0,
    knowledgeCreated: 0,
    knowledgeUpdated: 0,
    skipped: 0,
    skippedReasons: {},
    extractionErrors: 0,
    embeddingErrors: 0,
    databaseErrors: 0,
    canReadMessages: false,
    message,
  }
}
