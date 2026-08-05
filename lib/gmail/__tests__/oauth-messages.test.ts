/** @jest-environment node */
import { GMAIL_OAUTH_FAILURE_REASONS, getGmailOAuthFailureMessage } from '../oauth'

const REDIRECT_URI = 'http://localhost:3000/api/integrations/gmail/callback'

describe('Gmail OAuth failure messages', () => {
  it('explains a redirect mismatch with the exact URI to register', () => {
    // Act
    const message = getGmailOAuthFailureMessage('redirect_uri_mismatch', REDIRECT_URI)

    // Assert — names the failure, the URI, and where to look
    expect(message).toContain('redirect URL')
    expect(message).toContain(REDIRECT_URI)
    expect(message).toContain('.env.local')
  })

  it('explains a client mismatch without naming a secret value', () => {
    const message = getGmailOAuthFailureMessage('invalid_client', REDIRECT_URI)

    expect(message).toContain('GMAIL_CLIENT_ID')
    expect(message).toContain('GMAIL_CLIENT_SECRET')
    expect(message).toContain('same Google Cloud project')
  })

  it('explains when public Gmail access is paused', () => {
    const message = getGmailOAuthFailureMessage('verification_pending', REDIRECT_URI)

    expect(message).toContain('approved beta users')
    expect(message).toContain('restricted-scope verification')
  })

  it('points an invalid scope at the Data Access declaration', () => {
    const message = getGmailOAuthFailureMessage('invalid_scope', REDIRECT_URI)

    expect(message).toContain('gmail.readonly')
    expect(message).toContain('Data Access')
  })

  it('treats a cancelled consent as recoverable rather than an error', () => {
    const message = getGmailOAuthFailureMessage('access_denied', REDIRECT_URI)

    expect(message).toContain('cancelled')
  })

  it('falls back to a generic message for an unknown reason', () => {
    expect(getGmailOAuthFailureMessage('something_else', REDIRECT_URI)).toBe('Gmail connection failed. Please try again.')
    expect(getGmailOAuthFailureMessage(undefined, REDIRECT_URI)).toBe('Gmail connection failed. Please try again.')
  })

  it('never echoes token or secret values into user-facing copy', () => {
    const messages = [...GMAIL_OAUTH_FAILURE_REASONS, 'misconfigured', 'unknown']
      .map((reason) => getGmailOAuthFailureMessage(reason, REDIRECT_URI))
      .join(' ')

    // Env var names are fine to mention; their values are not. GOCSPX- prefixes Google
    // client secrets, ya29. prefixes access tokens, and 1// prefixes refresh tokens.
    expect(messages).not.toMatch(/GOCSPX-|ya29\.|1\/\/|sk_live|sk_test/)
    expect(messages).not.toMatch(/refresh token value|access token value/i)
  })
})
