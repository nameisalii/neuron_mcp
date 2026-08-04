const botScopes = [
  'channels:history',
  'channels:read',
  'users:read',
  'team:read',
  'chat:write',
  'commands',
]

const userScopes = [
  'channels:read',
  'channels:history',
  'groups:read',
  'groups:history',
  'im:read',
  'im:history',
  'mpim:read',
  'mpim:history',
  'users:read',
  'team:read',
]

const callbackPath = '/api/integrations/slack/callback'
const configuredRedirect = process.env.SLACK_REDIRECT_URI?.trim()
const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  || (process.env.NODE_ENV === 'production' ? 'https://app.tryneuron.net' : 'http://localhost:3000')
const computedRedirect = configuredRedirect || `${baseUrl}${callbackPath}`

console.log(`SLACK_CLIENT_ID present: ${Boolean(process.env.SLACK_CLIENT_ID?.trim())}`)
console.log(`SLACK_CLIENT_SECRET present: ${Boolean(process.env.SLACK_CLIENT_SECRET?.trim())}`)
console.log(`SLACK_REDIRECT_URI present: ${Boolean(configuredRedirect)}`)
console.log(`computed redirect URI: ${computedRedirect}`)
console.log(`team parameter configured: ${Boolean(process.env.SLACK_ALLOWED_TEAM_ID?.trim())}`)
console.log(`requested bot scopes: ${botScopes.join(',')}`)
console.log(`requested user scopes: ${userScopes.join(',')}`)
console.log(`expected callback path: ${callbackPath}`)
