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

  it('uses only low-risk scopes for basic Microsoft login', async () => {
    const { MICROSOFT_BASIC_SCOPES, getTeamsAuthorizeUrl } = await import('../config')
    process.env.MICROSOFT_CLIENT_ID = 'public-client-id'

    expect(MICROSOFT_BASIC_SCOPES).toEqual(['openid', 'profile', 'email', 'offline_access', 'User.Read'])
    const url = new URL(getTeamsAuthorizeUrl('safe-state')!)
    expect(url.pathname).toContain('/oauth2/v2.0/authorize')
    expect(url.pathname).not.toContain('adminconsent')
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(MICROSOFT_BASIC_SCOPES)
    expect(url.toString()).not.toContain('client-secret')
  })

  it('requests Teams message scopes only for explicit Teams sync', async () => {
    const { MICROSOFT_BASIC_SCOPES, TEAMS_SCOPES, TEAMS_SYNC_SCOPES, getTeamsAuthorizeUrl } = await import('../config')
    process.env.MICROSOFT_CLIENT_ID = 'public-client-id'
    process.env.MICROSOFT_CLIENT_SECRET = 'client-secret-must-not-leak'

    expect(TEAMS_SCOPES).toEqual([
      'openid',
      'profile',
      'email',
      'offline_access',
      'User.Read',
      'Team.ReadBasic.All',
      'Channel.ReadBasic.All',
      'ChannelMessage.Read.All',
    ])
    expect(TEAMS_SYNC_SCOPES).toEqual(['Team.ReadBasic.All', 'Channel.ReadBasic.All', 'ChannelMessage.Read.All'])
    expect(TEAMS_SCOPES).not.toContain('User.Read.All')
    const basicUrl = getTeamsAuthorizeUrl('basic', 'basic')!
    const teamsUrl = getTeamsAuthorizeUrl('teams', 'teams')!
    expect(new URL(basicUrl).searchParams.get('scope')?.split(' ')).toEqual(MICROSOFT_BASIC_SCOPES)
    expect(new URL(teamsUrl).searchParams.get('scope')?.split(' ')).toEqual(TEAMS_SCOPES)
    expect(basicUrl).not.toContain('client-secret-must-not-leak')
    expect(teamsUrl).not.toContain('client-secret-must-not-leak')
  })

  it('detects Microsoft admin consent errors without exposing raw token details', async () => {
    const { isTeamsAdminConsentError } = await import('../config')

    expect(isTeamsAdminConsentError('admin_consent_required')).toBe(true)
    expect(isTeamsAdminConsentError('access_denied', 'AADSTS65001: Administrator approval required')).toBe(true)
    expect(isTeamsAdminConsentError('access_denied', 'AADSTS90094')).toBe(true)
    expect(isTeamsAdminConsentError('consent_required')).toBe(true)
    expect(isTeamsAdminConsentError('interaction_required')).toBe(true)
    expect(isTeamsAdminConsentError('temporarily_unavailable')).toBe(false)
  })
})
