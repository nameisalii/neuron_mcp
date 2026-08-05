import { getGmailRedirectUri } from './config'

export { getGmailAppUrl as getAppUrl, getGmailRedirectUri } from './config'

/**
 * Reasons the Gmail callback may return in `?reason=`. Google's own OAuth error codes are
 * kept verbatim so the callback can pass them straight through after validating membership.
 */
export const GMAIL_OAUTH_FAILURE_REASONS = new Set([
  'redirect_uri_mismatch',
  'invalid_client',
  'invalid_grant',
  'invalid_scope',
  'access_denied',
  'org_internal',
  'integration_disabled',
  'verification_pending',
  'insufficient_scope',
])

function environmentHint(): string {
  return process.env.NODE_ENV === 'production'
    ? 'Check the Vercel environment variables and the Google Cloud OAuth client for the production project.'
    : 'Check .env.local and the Google Cloud OAuth client, then restart the development server.'
}

/**
 * Turn a Gmail callback reason into an actionable message: what failed, the redirect URI
 * actually in use, and where to look. Never includes secrets, tokens, or authorization codes.
 */
export function getGmailOAuthFailureMessage(
  reason: string | null | undefined,
  redirectUri: string = getGmailRedirectUri(),
): string {
  switch (reason) {
    case 'integration_disabled':
      return 'Gmail integration is currently disabled. Please contact your Neuron administrator.'
    case 'verification_pending':
      return 'Gmail is available to approved beta users while Google restricted-scope verification is finishing.'
    case 'redirect_uri_mismatch':
      return 'Gmail connection failed because Google rejected the redirect URL. Add this exact URL to the '
        + `Gmail OAuth client under Authorized redirect URIs: ${redirectUri}. ${environmentHint()}`
    case 'invalid_client':
      return 'Gmail connection failed because the OAuth client ID and secret do not match. Confirm '
        + `GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET come from the same Google Cloud project as ${redirectUri}. `
        + environmentHint()
    case 'invalid_grant':
      return 'Gmail connection failed because the authorization expired or was already used. '
        + 'Start the Gmail connection again from the integrations page.'
    case 'invalid_scope':
    case 'insufficient_scope':
      return 'Gmail connection failed because Google rejected the requested scope. The gmail.readonly '
        + 'scope must be declared and granted under Google Auth Platform → Data Access for this project.'
    case 'org_internal':
      return 'Your Google Workspace administrator has blocked this app. Ask your Workspace admin to allow '
        + 'Neuron, or connect a Google account outside the organization.'
    case 'access_denied':
      return 'Gmail connection was cancelled. You can start the connection again whenever you are ready.'
    case 'misconfigured':
      return `Gmail OAuth is not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET. ${environmentHint()}`
    default:
      return 'Gmail connection failed. Please try again.'
  }
}
