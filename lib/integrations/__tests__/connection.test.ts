import { isIntegrationConnected } from '../connection'

describe('isIntegrationConnected', () => {
  it('requires an explicit connected Notion credential', () => {
    expect(isIntegrationConnected(null)).toBe(false)
    expect(isIntegrationConnected({ type: 'notion', accessToken: '' })).toBe(false)
    expect(isIntegrationConnected({ type: 'notion', accessToken: 'notion-static' })).toBe(false)
    expect(isIntegrationConnected({
      type: 'notion',
      accessToken: 'encrypted-workspace-token',
      metadata: { status: 'connected' },
    })).toBe(true)
    expect(isIntegrationConnected({
      type: 'notion',
      accessToken: 'notion-server-token',
      metadata: { status: 'connected' },
    })).toBe(false)
  })

  it('rejects disconnected and error statuses for every integration', () => {
    expect(isIntegrationConnected({
      type: 'linear',
      accessToken: 'token',
      metadata: { status: 'error' },
    })).toBe(false)
  })

  it('does not expose a solo workspace connection to another user', () => {
    const integration = {
      type: 'notion',
      accessToken: 'encrypted-user-a-token',
      metadata: { status: 'connected', connectedBy: 'user-a' },
    }

    expect(isIntegrationConnected(integration, {
      currentUserId: 'user-a',
      workspaceType: 'solo',
      workspaceOwnerClerkId: 'user-a',
    })).toBe(true)
    expect(isIntegrationConnected(integration, {
      currentUserId: 'user-b',
      workspaceType: 'solo',
      workspaceOwnerClerkId: 'user-a',
    })).toBe(false)
  })
})
