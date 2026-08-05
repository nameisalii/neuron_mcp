/**
 * Gmail access gating.
 *
 * Public mode is explicitly enabled after Google approval. When public mode is paused,
 * integration-testing and test-user access remain available for safe staged rollouts.
 */

const TEST_USERS_KEY = 'GMAIL_TEST_USERS'

export function isGmailIntegrationEnabled(): boolean {
  return process.env.GMAIL_INTEGRATION_ENABLED === 'true'
}

export function isGmailPublicEnabled(): boolean {
  return isGmailIntegrationEnabled() && process.env.GMAIL_PUBLIC_ENABLED === 'true'
}

export function getGmailTestUsers(): string[] {
  const raw = process.env[TEST_USERS_KEY]?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function isGmailTestUser(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return false
  return getGmailTestUsers().includes(normalized)
}

/**
 * Gmail OAuth may start publicly when approved public mode is enabled. Otherwise it is
 * limited strictly to the Gmail test-user allowlist while restricted-scope review is pending.
 */
export function isGmailConnectAllowed(email: string | null | undefined): boolean {
  if (!isGmailIntegrationEnabled()) return false
  return isGmailPublicEnabled() || isGmailTestUser(email)
}
