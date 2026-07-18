/** @jest-environment node */

describe('Gmail OAuth configuration', () => {
  const originalEnv = process.env
  beforeEach(() => { jest.resetModules(); process.env = { ...originalEnv, NODE_ENV: 'test', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' } })
  afterEach(() => { process.env = originalEnv; jest.restoreAllMocks() })

  it('keeps identity scopes separate and requests only gmail.readonly', async () => {
    const config = await import('../config')
    expect(config.GOOGLE_SIGNIN_IDENTITY_SCOPES).toEqual(['openid', 'email', 'profile'])
    expect(config.GMAIL_SCOPES).toEqual(['https://www.googleapis.com/auth/gmail.readonly'])
    expect(config.getGmailScopes()).toBe('https://www.googleapis.com/auth/gmail.readonly')
    expect(config.getGmailScopes()).not.toMatch(/gmail\.modify|gmail\.send|gmail\.compose|mail\.google\.com/)
  })

  it('prefers a dedicated Gmail client and supports the documented callback override', async () => {
    process.env.GMAIL_CLIENT_ID = 'gmail-client'
    process.env.GOOGLE_CLIENT_ID = 'shared-client'
    process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/api/integrations/gmail/callback'
    const config = await import('../config')
    expect(config.getGmailClientId()).toBe('gmail-client')
    expect(config.getGmailRedirectUri()).toBe('http://localhost:3000/api/integrations/gmail/callback')
  })

  it('safe debug output excludes secrets, tokens, and the full client ID', async () => {
    process.env.GOOGLE_OAUTH_DEBUG_SAFE = 'true'
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined)
    const { safeGoogleOAuthDebug } = await import('../config')
    safeGoogleOAuthDebug({ flow: 'gmail', clientId: '12345678-full-client-id', redirectUri: 'http://localhost:3000/api/integrations/gmail/callback', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] })
    const output = JSON.stringify(info.mock.calls)
    expect(output).toContain('12345678')
    expect(output).toContain('https://www.googleapis.com/auth/gmail.readonly')
    expect(output).not.toMatch(/full-client-id|client.secret|access.token|refresh.token|auth.code/i)
  })
})
