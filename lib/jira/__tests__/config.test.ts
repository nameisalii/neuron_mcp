describe('Jira configuration', () => {
  const original = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...original }
    delete process.env.ATLASSIAN_CLIENT_ID
    delete process.env.ATLASSIAN_CLIENT_SECRET
    delete process.env.ATLASSIAN_REDIRECT_URI
  })

  afterAll(() => {
    process.env = original
  })

  it('loads safely when Jira environment variables are missing', async () => {
    const { getJiraConfig, isJiraOAuthConfigured } = await import('../config')

    expect(getJiraConfig()).toEqual({
      clientId: null,
      clientSecret: null,
      redirectUri: 'http://localhost:3000/api/integrations/jira/callback',
    })
    expect(isJiraOAuthConfigured()).toBe(false)
  })
})
