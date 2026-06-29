import { getAppUrl } from '@/lib/app-url'

// Discord env vars are intentionally NOT part of lib/env.ts required vars, so a
// missing Discord config never blocks app boot. Routes check these at request
// time and return a safe "not configured" message instead.

export interface DiscordOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

function resolveRedirectUri(): string {
  return process.env.DISCORD_REDIRECT_URI || `${getAppUrl()}/api/integrations/discord/callback`
}

/** OAuth config for connect/callback. Returns null when not fully configured. */
export function getDiscordOAuthConfig(): DiscordOAuthConfig | null {
  const clientId = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, redirectUri: resolveRedirectUri() }
}

/** Client id + redirect for building the install URL (connect only needs these). */
export function getDiscordInstallConfig(): { clientId: string; redirectUri: string } | null {
  const clientId = process.env.DISCORD_CLIENT_ID
  if (!clientId) return null
  return { clientId, redirectUri: resolveRedirectUri() }
}

/** Bot token for the sync job. Returns null when not configured. */
export function getDiscordBotToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN || null
}
