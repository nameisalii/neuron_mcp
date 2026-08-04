import { ErrorCode, WebClient } from '@slack/web-api'

export type SlackConversationType = 'public_channel' | 'private_channel' | 'mpim' | 'im'

export interface SlackUserConversation {
  id: string
  name: string
  type: SlackConversationType
}

export interface SlackUserMessage {
  ts: string
  text: string
  user: string
  channel: string
}

const ADMIN_ERRORS = new Set(['missing_scope', 'not_allowed_token_type', 'app_not_approved'])
const RECONNECT_ERRORS = new Set(['account_inactive', 'invalid_auth', 'token_revoked'])

export class SlackUserAccessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requiresAdmin = false,
    public readonly requiresReconnect = false,
  ) {
    super(message)
    this.name = 'SlackUserAccessError'
  }
}

function slackError(error: unknown): SlackUserAccessError {
  const code = (error as { data?: { error?: string } })?.data?.error
    ?? (error as { code?: string })?.code
    ?? 'slack_api_error'
  if (ADMIN_ERRORS.has(code)) {
    return new SlackUserAccessError(
      code,
      code === 'missing_scope'
        ? 'Neuron needs additional Slack permissions to read this conversation type.'
        : 'Your Slack workspace requires admin approval for this access.',
      true,
    )
  }
  if (RECONNECT_ERRORS.has(code)) {
    return new SlackUserAccessError(code, 'Reconnect your Slack account to continue.', false, true)
  }
  return new SlackUserAccessError(code, 'Slack could not read this conversation.')
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if ((error as { code?: string })?.code === ErrorCode.RateLimitedError) {
      const retryAfter = Math.min((error as { retryAfter?: number }).retryAfter ?? 1, 30)
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
      try {
        return await fn()
      } catch (retryError) {
        throw slackError(retryError)
      }
    }
    throw slackError(error)
  }
}

export function createSlackUserClient(token: string): WebClient {
  return new WebClient(token, { rejectRateLimitedCalls: true })
}

function conversationType(channel: {
  is_im?: boolean
  is_mpim?: boolean
  is_private?: boolean
}): SlackConversationType {
  if (channel.is_im) return 'im'
  if (channel.is_mpim) return 'mpim'
  if (channel.is_private) return 'private_channel'
  return 'public_channel'
}

export async function listUserAccessibleConversations(input: {
  client: WebClient
  maxConversations?: number
}): Promise<SlackUserConversation[]> {
  const maximum = input.maxConversations ?? 50
  const conversations: SlackUserConversation[] = []
  let cursor: string | undefined
  do {
    const page = await withRateLimitRetry(() => input.client.conversations.list({
      types: 'public_channel,private_channel,mpim,im',
      exclude_archived: true,
      limit: Math.min(200, maximum - conversations.length),
      cursor,
    }))
    for (const channel of page.channels ?? []) {
      if (!channel.id) continue
      conversations.push({
        id: channel.id,
        name: channel.name ?? channel.user ?? (channel.is_mpim ? 'Group DM' : 'Direct message'),
        type: conversationType(channel),
      })
      if (conversations.length >= maximum) break
    }
    cursor = page.response_metadata?.next_cursor || undefined
  } while (cursor && conversations.length < maximum)
  return conversations
}

export async function fetchConversationHistory(input: {
  client: WebClient
  channelId: string
  oldest?: string
  latest?: string
  maxMessages?: number
}): Promise<SlackUserMessage[]> {
  const maximum = input.maxMessages ?? 100
  const messages: SlackUserMessage[] = []
  let cursor: string | undefined
  do {
    const page = await withRateLimitRetry(() => input.client.conversations.history({
      channel: input.channelId,
      limit: Math.min(200, maximum - messages.length),
      cursor,
      ...(input.oldest ? { oldest: input.oldest } : {}),
      ...(input.latest ? { latest: input.latest } : {}),
    }))
    for (const message of page.messages ?? []) {
      if (!message.text?.trim() || !message.ts || message.bot_id || message.subtype === 'bot_message') continue
      messages.push({
        ts: message.ts,
        text: message.text.trim(),
        user: message.user ?? 'Slack member',
        channel: input.channelId,
      })
      if (messages.length >= maximum) break
    }
    cursor = page.response_metadata?.next_cursor || undefined
  } while (cursor && messages.length < maximum)
  return messages
}
