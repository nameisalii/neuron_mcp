// Discord REST API client. Uses the bot token server-side only.
// Docs: https://discord.com/developers/docs/reference
const DISCORD_API_BASE = 'https://discord.com/api/v10'
const MAX_RETRIES = 3

// Channel types we can read text from. https://discord.com/developers/docs/resources/channel#channel-object-channel-types
export const READABLE_CHANNEL_TYPES = new Set([0, 5]) // GUILD_TEXT, GUILD_ANNOUNCEMENT

export class DiscordApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'DiscordApiError'
  }
}

export interface DiscordChannel {
  id: string
  name: string | null
  type: number
}

export interface DiscordMessage {
  id: string
  content: string
  timestamp: string
  type: number
  author: { id: string; username: string; global_name?: string | null; bot?: boolean }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function discordFetch(botToken: string, path: string): Promise<unknown> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${DISCORD_API_BASE}${path}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
        'User-Agent': 'NeuronBot (https://app.tryneuron.net, 1.0)',
      },
    })

    if (res.status === 429) {
      if (attempt === MAX_RETRIES) throw new DiscordApiError('Discord rate limit exceeded', 429)
      const retryAfter = Number(res.headers.get('retry-after')) || attempt
      await sleep(retryAfter * 1000)
      continue
    }

    if (!res.ok) {
      throw new DiscordApiError(`Discord API request failed (${res.status})`, res.status)
    }

    return res.json()
  }
  throw new DiscordApiError('Discord API request failed', 500)
}

/** List channels in a guild. Throws DiscordApiError(403) when the bot lacks access. */
export async function listGuildChannels(botToken: string, guildId: string): Promise<DiscordChannel[]> {
  const json = (await discordFetch(botToken, `/guilds/${encodeURIComponent(guildId)}/channels`)) as unknown
  if (!Array.isArray(json)) return []
  return json
    .filter((channel): channel is DiscordChannel => typeof channel === 'object' && channel !== null)
    .map((channel) => ({ id: String(channel.id), name: channel.name ?? null, type: Number(channel.type) }))
}

/**
 * Fetch up to `limit` recent messages from a channel (newest first).
 * Returns [] (not throw) on 403 so a single locked channel does not fail the sync.
 */
export async function getChannelMessages(
  botToken: string,
  channelId: string,
  options: { limit?: number; before?: string | null } = {},
): Promise<DiscordMessage[]> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 100) })
  if (options.before) params.set('before', options.before)
  try {
    const json = (await discordFetch(botToken, `/channels/${encodeURIComponent(channelId)}/messages?${params}`)) as unknown
    if (!Array.isArray(json)) return []
    return json as DiscordMessage[]
  } catch (err) {
    if (err instanceof DiscordApiError && (err.status === 403 || err.status === 401)) return []
    throw err
  }
}
