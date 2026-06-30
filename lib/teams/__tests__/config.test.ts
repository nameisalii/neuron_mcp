describe('Microsoft Teams configuration', () => {
  const original = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...original }
    delete process.env.MICROSOFT_CLIENT_ID
    delete process.env.MICROSOFT_CLIENT_SECRET
    delete process.env.MICROSOFT_TENANT_ID
    delete process.env.MICROSOFT_REDIRECT_URI
    delete process.env.MICROSOFT_TEAMS_WEBHOOK_CLIENT_STATE
  })

  afterAll(() => {
    process.env = original
  })

  it('loads safely when Teams environment variables are missing', async () => {
    const { getTeamsConfig, isTeamsOAuthConfigured } = await import('../config')

    expect(getTeamsConfig()).toEqual({
      clientId: null,
      clientSecret: null,
      tenantId: 'common',
      redirectUri: 'http://localhost:3000/api/integrations/teams/callback',
      webhookClientState: null,
    })
    expect(isTeamsOAuthConfigured()).toBe(false)
  })
})
