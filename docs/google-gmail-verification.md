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

## Which failure is which

Google Sign-In and Gmail fail independently and are fixed in different dashboards. Check the symptom against this table before changing anything.

| Symptom | Owner | Where to fix |
| --- | --- | --- |
| Cannot sign in with Google at all | Clerk | Clerk Dashboard → Social connections → Google; Clerk production instance and domain |
| Sign-in works, Gmail setup needed | Neuron | `GMAIL_INTEGRATION_ENABLED`, `GMAIL_PUBLIC_ENABLED`, and Gmail OAuth credentials |
| `redirect_uri_mismatch` | Google Cloud | OAuth client → Authorized redirect URIs |
| `invalid_client` | Env | `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` must come from the same project |
| `invalid_scope` | Google Cloud | Google Auth Platform → Data Access scope declaration |
| Unverified-app warning screen | Google Cloud | Publishing status and restricted-scope verification |

Google Sign-In is handled entirely by Clerk. Neuron has no Google sign-in code, so no repository change can fix or break it.

## Gmail public access

Branding is verified and the OAuth audience is in production. While Google finishes
restricted-scope Data Access review, Gmail remains beta-gated with:

```
GMAIL_INTEGRATION_ENABLED=true
GMAIL_PUBLIC_ENABLED=false
GMAIL_TEST_USERS=your-email@example.com
```

| Variable | Effect |
| --- | --- |
| `GMAIL_PUBLIC_ENABLED=true` | Allows every signed-in user to start Gmail OAuth. |
| `GMAIL_PUBLIC_ENABLED=false` | Pauses public access while keeping test-user gating available. |
| `GMAIL_TEST_USERS=a@example.com,b@example.com` | Allows listed accounts when public mode is paused. Matching is case-insensitive. |

Pausing public access does not delete existing Gmail data or connections. The requested scope remains exactly `https://www.googleapis.com/auth/gmail.readonly`.

## Local testing

Add these non-secret lines to `.env.local`, then restart the dev server:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
GMAIL_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/callback
GMAIL_INTEGRATION_ENABLED=true
GMAIL_PUBLIC_ENABLED=false
GMAIL_TEST_USERS=your-email@example.com
GOOGLE_OAUTH_DEBUG_SAFE=true
```

`GMAIL_REDIRECT_URI` is optional; without it the redirect URI is derived from `NEXT_PUBLIC_APP_URL`. `GOOGLE_OAUTH_DEBUG_SAFE=true` enables the truncated-client-ID debug line, which never prints secrets and is ignored in production.

Verify the resolved configuration without exposing secrets:

```
npx dotenv-cli -e .env.local -- node scripts/check-google-gmail-config.mjs
```

Expect `computed redirect URI http://localhost:3000/api/integrations/gmail/callback`, `effective client project number 130468741737`, `requests write scopes false`, and no warnings.

## Google Cloud Console checklist

1. Select the project Google approved: project number `130468741737`, project ID `project-949b454e-9626-44c2-816`. The OAuth client used by Gmail must belong to this project.
2. Open APIs & Services → Google Auth Platform.
3. Confirm the publishing status is In production and monitor the restricted-scope Data Access review until approval is complete.
4. Audience: External, since Neuron serves users outside a single Workspace.
5. Authorized domain: `tryneuron.net`.
6. App homepage: `https://tryneuron.net`.
7. Privacy policy: `https://tryneuron.net/privacy`.
8. Terms of service: `https://tryneuron.net/terms`.
9. Scopes — declare exactly what the app requests and nothing more:
   - Google Sign-In identity scopes (`openid`, `email`, `profile`) are requested by Clerk.
   - Gmail restricted scope: `https://www.googleapis.com/auth/gmail.readonly`.
10. Data access justification, least privilege: Neuron only reads selected user email metadata and thread content to build private searchable memory, tasks, and decisions. Neuron does not send, modify, or delete emails, and does not access unrelated Google services.
11. Keep approved beta accounts in `GMAIL_TEST_USERS` until restricted-scope approval is complete.
12. OAuth client configuration:
    - Authorized JavaScript origins: `http://localhost:3000` and `https://app.tryneuron.net`
    - Authorized redirect URIs: `http://localhost:3000/api/integrations/gmail/callback` and `https://app.tryneuron.net/api/integrations/gmail/callback`
    - Do not add `/api/auth/callback/google`; that route does not exist.
    - Clerk's Google credentials are configured separately in the Clerk Dashboard. Use the exact Authorized Redirect URI that Clerk displays rather than guessing it.
13. Enable the Gmail API for the project under APIs & Services → Enabled APIs.
14. To pause public Gmail access, set `GMAIL_PUBLIC_ENABLED=false` and optionally use `GMAIL_TEST_USERS` for controlled access.

## Production checklist

Vercel environment:

```
NEXT_PUBLIC_APP_URL=https://app.tryneuron.net
GMAIL_INTEGRATION_ENABLED=true
GMAIL_PUBLIC_ENABLED=false
GMAIL_TEST_USERS=msirozhdinov@gmail.com
GMAIL_REDIRECT_URI=https://app.tryneuron.net/api/integrations/gmail/callback
GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET   # from project 130468741737
```

Clerk remains a separate Google Sign-In integration. Gmail OAuth continues to use only `gmail.readonly`.
