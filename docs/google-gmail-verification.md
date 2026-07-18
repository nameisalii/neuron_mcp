# Google Sign-In and Gmail verification

Neuron has two independent Google authorization flows. Google Auth Platform branding verification confirms the app's identity and public-facing information; it does not grant or verify access to restricted Gmail data. Gmail data-access verification is a separate review.

## Google Sign-In / Sign-Up

- Provider: Clerk (`@clerk/nextjs`)
- Pages: `/sign-in` and `/sign-up`
- Scopes: `openid`, `email`, `profile`
- Purpose: account identity and login only
- Application environment: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Google OAuth credentials: configured in the Clerk Dashboard, not read by Neuron's sign-in code
- Repository callback route: none; there is no `/api/auth/callback/google` route
- Current production Clerk callback documented by the project: `https://clerk.app.tryneuron.net/v1/oauth_callback`
- Development: use the Authorized Redirect URI shown by the active Clerk development instance. Clerk development instances may use Clerk's shared Google credentials.

Basic identity scopes generally do not require restricted-scope Gmail verification. Confirm in the Clerk Dashboard that the Google social connection requests only identity scopes.

Because Clerk generates the Google Sign-In authorization request outside this repository, Neuron cannot emit a Sign-In client-ID prefix or redirect URI through `GOOGLE_OAUTH_DEBUG_SAFE`. Verify those values in Clerk Dashboard → Social connections → Google. Neuron's safe debug helper is used for the custom Gmail flow that this application generates.

## Gmail integration

- Provider: Neuron's server-side Google OAuth implementation
- Scope: `https://www.googleapis.com/auth/gmail.readonly`
- Purpose: read selected Gmail threads so Neuron can summarize and answer questions from connected email
- Preferred credentials: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`
- Backward-compatible shared-client fallback: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Redirect override: `GMAIL_REDIRECT_URI`
- Callback route: `/api/integrations/gmail/callback`

Authorized redirect URIs for the Gmail OAuth client:

- Local: `http://localhost:3000/api/integrations/gmail/callback`
- Production: `https://app.tryneuron.net/api/integrations/gmail/callback`

If one Google OAuth client is intentionally shared, add both Gmail callback URLs and the exact Clerk Authorized Redirect URI shown in the Clerk Dashboard to that client. Do not add `/api/auth/callback/google`; that route does not exist in this application.

## Google Cloud checklist

1. In Google Auth Platform → Data Access, declare only `https://www.googleapis.com/auth/gmail.readonly` for the Gmail integration.
2. Do not request `gmail.modify`, `gmail.send`, `gmail.compose`, or `https://mail.google.com/`.
3. Explain that Gmail data is read to create private, searchable email knowledge.
4. Add the local and production Gmail redirect URIs exactly as listed above.
5. During testing, add accounts under Google Auth Platform → Audience → Test users.
6. Public production use of the restricted Gmail scope may require restricted-scope verification and a third-party security assessment.

If the scopes requested by Neuron differ from the scopes declared under Google Auth Platform → Data Access, Google may show the unverified-app screen. The OAuth client used by Gmail must belong to the Google Cloud project whose branding, audience, and Data Access configuration are being reviewed.

Test users can still encounter warnings or limits while the OAuth app is unverified. Gmail is optional; Neuron continues to work with other integrations and file/manual knowledge when Gmail cannot be connected.
