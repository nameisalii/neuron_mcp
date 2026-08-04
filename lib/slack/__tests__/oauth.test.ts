import { buildSlackAuthorizeUrl, SLACK_USER_SCOPES } from '../oauth'

it('requests Slack user scopes separately from bot scopes', () => {
  const url = new URL(buildSlackAuthorizeUrl({
    clientId: 'client-1',
    redirectUri: 'https://app.example.com/api/integrations/slack/callback',
    state: 'state-1',
    mode: 'user',
  }))

  expect(url.searchParams.get('scope')).toBe('')
  expect(url.searchParams.get('user_scope')?.split(',')).toEqual(SLACK_USER_SCOPES)
  expect(SLACK_USER_SCOPES).toEqual(expect.arrayContaining([
    'channels:read', 'channels:history', 'groups:read', 'groups:history',
    'im:read', 'im:history', 'mpim:read', 'mpim:history', 'users:read', 'team:read',
  ]))
})

it('keeps bot scopes for workspace bot mode', () => {
  const url = new URL(buildSlackAuthorizeUrl({
    clientId: 'client-1',
    redirectUri: 'https://app.example.com/api/integrations/slack/callback',
    state: 'state-1',
    mode: 'bot',
  }))
  expect(url.searchParams.get('scope')).toContain('channels:history')
  expect(url.searchParams.has('user_scope')).toBe(false)
})

it('does not pin OAuth to a Slack team by default', () => {
  const url = new URL(buildSlackAuthorizeUrl({
    clientId: 'client-1',
    redirectUri: 'http://localhost:3000/api/integrations/slack/callback',
    state: 'state-1',
    mode: 'user',
  }))
  expect(url.searchParams.has('team')).toBe(false)
})

it('includes an optional explicitly configured Slack team', () => {
  const url = new URL(buildSlackAuthorizeUrl({
    clientId: 'client-1',
    redirectUri: 'http://localhost:3000/api/integrations/slack/callback',
    state: 'state-1',
    mode: 'user',
    teamId: 'T_ALLOWED',
  }))
  expect(url.searchParams.get('team')).toBe('T_ALLOWED')
})
