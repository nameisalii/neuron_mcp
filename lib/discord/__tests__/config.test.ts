/** @jest-environment node */
import { getDiscordOAuthConfig, getDiscordInstallConfig, getDiscordBotToken } from '../config'

jest.mock('@/lib/app-url', () => ({ getAppUrl: () => 'http://localhost:3000' }))

const ENV_KEYS = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_REDIRECT_URI',
] as const

const original: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    original[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

it('returns null (does not throw) when Discord env is missing — app stays bootable', () => {
  expect(getDiscordOAuthConfig()).toBeNull()
  expect(getDiscordInstallConfig()).toBeNull()
  expect(getDiscordBotToken()).toBeNull()
})

it('builds config when env is present and falls back to app URL for redirect', () => {
  process.env.DISCORD_CLIENT_ID = 'client-123'
  process.env.DISCORD_CLIENT_SECRET = 'secret-456'
  process.env.DISCORD_BOT_TOKEN = 'bot-789'

  expect(getDiscordBotToken()).toBe('bot-789')
  expect(getDiscordOAuthConfig()).toEqual({
    clientId: 'client-123',
    clientSecret: 'secret-456',
    redirectUri: 'http://localhost:3000/api/integrations/discord/callback',
  })
})
