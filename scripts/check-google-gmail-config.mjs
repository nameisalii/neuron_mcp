/**
 * Safe Google / Gmail OAuth configuration diagnostic.
 *
 * Prints presence booleans, non-secret values, and warnings only.
 * Never prints a client secret, refresh token, access token, or authorization code.
 *
 * Usage: npx dotenv-cli -e .env.local -- node scripts/check-google-gmail-config.mjs
 */

// Project that Google approved for this app (see the OAuth verification email).
const EXPECTED_PROJECT_NUMBER = '130468741737'
const EXPECTED_PROJECT_ID = 'project-949b454e-9626-44c2-816'

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
const SIGNIN_IDENTITY_SCOPES = ['openid', 'email', 'profile']

const callbackPath = '/api/integrations/gmail/callback'

const read = (key) => process.env[key]?.trim() || ''
const present = (key) => Boolean(read(key))

const appUrl = read('NEXT_PUBLIC_APP_URL').replace(/\/+$/, '')
const explicitRedirect = read('GMAIL_REDIRECT_URI')
const fallbackAppUrl = process.env.NODE_ENV === 'production'
  ? 'https://app.tryneuron.net'
  : 'http://localhost:3000'
const computedRedirectUri = explicitRedirect || `${appUrl || fallbackAppUrl}${callbackPath}`

const gmailClientId = read('GMAIL_CLIENT_ID')
const googleClientId = read('GOOGLE_CLIENT_ID')
const effectiveClientId = gmailClientId || googleClientId

// A Google OAuth client ID looks like "<projectNumber>-<hash>.apps.googleusercontent.com".
// The project number is public information, not a secret.
const projectNumber = effectiveClientId ? effectiveClientId.split('-')[0] : ''

const testUsers = read('GMAIL_TEST_USERS')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
const testingEnabled = read('ENABLE_UPCOMING_INTEGRATION_TESTING') === 'true'
const integrationEnabled = read('GMAIL_INTEGRATION_ENABLED') === 'true'
const publicEnabled = integrationEnabled && read('GMAIL_PUBLIC_ENABLED') === 'true'

console.log('== Application ==')
console.log('NODE_ENV', process.env.NODE_ENV || '(not set)')
console.log('NEXT_PUBLIC_APP_URL present', present('NEXT_PUBLIC_APP_URL'))
console.log('NEXT_PUBLIC_APP_URL', appUrl || '(not set)')

console.log('')
console.log('== Gmail OAuth (restricted scope) ==')
console.log('GMAIL_CLIENT_ID present', present('GMAIL_CLIENT_ID'))
console.log('GMAIL_CLIENT_SECRET present', present('GMAIL_CLIENT_SECRET'))
console.log('GOOGLE_CLIENT_ID present (fallback)', present('GOOGLE_CLIENT_ID'))
console.log('GOOGLE_CLIENT_SECRET present (fallback)', present('GOOGLE_CLIENT_SECRET'))
console.log('effective client ID prefix', effectiveClientId ? effectiveClientId.slice(0, 8) : '(none)')
console.log('effective client project number', projectNumber || '(unknown)')
console.log('GMAIL_REDIRECT_URI present', Boolean(explicitRedirect))
console.log('computed redirect URI', computedRedirectUri)
console.log('expected callback path', callbackPath)
console.log('scopes requested', GMAIL_SCOPES.join(' '))
console.log('requests gmail.readonly', GMAIL_SCOPES.includes('https://www.googleapis.com/auth/gmail.readonly'))
console.log('requests write scopes', GMAIL_SCOPES.some((s) => /gmail\.(modify|send|compose)|mail\.google\.com/.test(s)))

console.log('')
console.log('== Gmail gating ==')
console.log('GMAIL_INTEGRATION_ENABLED', integrationEnabled)
console.log('GMAIL_PUBLIC_ENABLED', publicEnabled)
console.log('ENABLE_UPCOMING_INTEGRATION_TESTING', testingEnabled)
console.log('GMAIL_TEST_USERS count', testUsers.length)
console.log('public connect allowed', publicEnabled || testingEnabled)

console.log('')
console.log('== Google Sign-In (Clerk-owned) ==')
console.log('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY present', present('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'))
console.log('CLERK_SECRET_KEY present', present('CLERK_SECRET_KEY'))
console.log('clerk instance', read('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY').startsWith('pk_live')
  ? 'production'
  : read('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY').startsWith('pk_test') ? 'development' : '(unknown)')
console.log('identity scopes (configured in Clerk, not here)', SIGNIN_IDENTITY_SCOPES.join(' '))

const warnings = []

if (!gmailClientId && !googleClientId) {
  warnings.push('No GMAIL_CLIENT_ID or GOOGLE_CLIENT_ID is set. Gmail connect will fail with "not configured".')
}
if (gmailClientId && googleClientId && gmailClientId !== googleClientId) {
  warnings.push('GMAIL_CLIENT_ID and GOOGLE_CLIENT_ID are both set and differ. Gmail uses GMAIL_CLIENT_ID; confirm that is the intended OAuth client.')
}
if (effectiveClientId && !read(gmailClientId ? 'GMAIL_CLIENT_SECRET' : 'GOOGLE_CLIENT_SECRET')) {
  warnings.push('A client ID is set without its matching client secret. Token exchange will fail with invalid_client.')
}
if (projectNumber && projectNumber !== EXPECTED_PROJECT_NUMBER) {
  warnings.push(`OAuth client belongs to project ${projectNumber}, not the approved project ${EXPECTED_PROJECT_NUMBER} (${EXPECTED_PROJECT_ID}).`)
}
if (process.env.NODE_ENV === 'production' && computedRedirectUri.includes('localhost')) {
  warnings.push('NODE_ENV is production but the redirect URI points at localhost. Set NEXT_PUBLIC_APP_URL to https://app.tryneuron.net in Vercel.')
}
if (process.env.NODE_ENV !== 'production' && computedRedirectUri.includes('app.tryneuron.net')) {
  warnings.push('Running outside production but the redirect URI points at app.tryneuron.net. Local OAuth will not return to this machine.')
}
if (!computedRedirectUri.endsWith(callbackPath)) {
  warnings.push(`GMAIL_REDIRECT_URI does not end with ${callbackPath}. Connect and callback must use the same URL.`)
}
if (!integrationEnabled) {
  warnings.push('GMAIL_INTEGRATION_ENABLED is not true. Gmail connect is disabled.')
}
if (integrationEnabled && !publicEnabled) {
  warnings.push('GMAIL_PUBLIC_ENABLED is not true. Gmail remains limited to integration testing and GMAIL_TEST_USERS.')
}

console.log('')
console.log('== Warnings ==')
if (warnings.length === 0) {
  console.log('none')
} else {
  for (const warning of warnings) console.log('WARN', warning)
}
