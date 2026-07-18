# Datatruck Auth Audit

Date: 2026-07-10

This audit was performed against a manually authenticated Datatruck browser session. Raw passwords, cookies, session IDs, JWTs, Authorization values, CSRF values, API keys, and private record bodies were intentionally not recorded.

## Summary

Datatruck's web application does not use the existing Open API token for many web-app modules. The web app uses an AWS Cognito sign-in flow, then sends Bearer JWT credentials to Datatruck internal APIs.

The existing Neuron Datatruck connector should continue using the official Open API token for the six confirmed Open API endpoints. The internal web endpoints discovered in the browser audit should not be added to production sync until Datatruck confirms this auth model is supported for customer/server integrations or Neuron implements an explicit per-workspace interactive auth connector with encrypted refresh-token storage.

## Observed Auth Flow

1. The web app performs a tenant lookup request before Cognito login:
   - Endpoint: `https://api.datatruck.io/api/clients/tenant-login/`
   - Method: `GET`
   - Response shape: array
   - First result field names: `schema_name`, `cognito`, `force_2fa`, `user_2fa_enabled`
   - Auth header: none observed
   - Cookies/CSRF: none observed

2. The web app authenticates with AWS Cognito:
   - Endpoint: `https://cognito-idp.us-east-2.amazonaws.com/`
   - Method: `POST`
   - Request content type: `application/x-amz-json-1.1`
   - Request field names: `AuthFlow`, `AuthParameters`, `ClientMetadata`, `ClientId`
   - Auth header: none observed
   - Cookies/CSRF: none observed

3. The web app exchanges/authorizes the Cognito credential with Datatruck:
   - Endpoint pattern: `https://{company}.datatruck.io/api/v1/auth/authorize/`
   - Method: `POST`
   - Request field names: `access_token`
   - Request Authorization scheme: `Bearer`
   - Response field names: `result`, `expires_at`
   - Token-like response field name observed: `session`
   - Status observed: `201`

4. Subsequent Datatruck web API requests use:
   - Authorization scheme: `Bearer`
   - Cookies: not required for captured data endpoints
   - CSRF: not observed for captured data endpoints

## Browser Storage

Only key names and metadata were recorded.

| Storage | Key name | Likely purpose | Value type | JWT-like | Approx lifetime |
|---|---|---|---|---:|---:|
| localStorage | `CognitoIdentityServiceProvider.<clientId>.LastAuthUser` | Cognito last signed-in user marker | string | no | n/a |
| localStorage | `CognitoIdentityServiceProvider.<clientId>.<user>.accessToken` | Cognito access token | string | yes | 60 minutes |
| localStorage | `CognitoIdentityServiceProvider.<clientId>.<user>.idToken` | Cognito ID token | string | yes | 60 minutes |
| localStorage | `CognitoIdentityServiceProvider.<clientId>.<user>.refreshToken` | Cognito refresh token | string | no | not encoded in token |
| localStorage | `CognitoIdentityServiceProvider.<clientId>.<user>.clockDrift` | Cognito clock drift metadata | string | no | n/a |
| localStorage | `CognitoIdentityServiceProvider.<clientId>.<user>.signInDetails` | Cognito sign-in metadata | string | no | n/a |
| localStorage | `token` | Datatruck app token object | string JSON | mixed | see below |

The `token` localStorage object contains only these field names:

- `access`
- `refresh`

Both values were JWT-like in the inspected session and had an approximate 60 minute lifetime. Values were not recorded.

sessionStorage contained UI filters and analytics/session-replay keys. No Datatruck auth token was observed there.

IndexedDB contained analytics data only in the inspected session. No Datatruck auth token was observed there.

Cookies observed for `.datatruck.io` were analytics/support cookies. No cookie-only Datatruck API auth was observed for captured data endpoints.

## Refresh Behavior

A safe refresh probe from the authenticated page context confirmed Cognito refresh-token behavior:

- Endpoint: `https://cognito-idp.us-east-2.amazonaws.com/`
- Method: `POST`
- Target: `AWSCognitoIdentityProviderService.InitiateAuth`
- Auth flow: `REFRESH_TOKEN_AUTH`
- Request field names: `AuthFlow`, `ClientId`, `AuthParameters.REFRESH_TOKEN`
- Response field names: `AuthenticationResult`, `ChallengeParameters`
- Authentication result field names: `AccessToken`, `ExpiresIn`, `IdToken`, `TokenType`
- Access token approximate lifetime: 60 minutes
- ID token approximate lifetime: 60 minutes
- Refresh token returned during refresh: no
- Refresh-token rotation observed: no rotation in this probe

The refresh token itself was not printed or persisted.

## Token Portability

Using the same authenticated session, Bearer credentials from browser storage successfully authorized representative internal Datatruck modules. Status-only checks were performed; token values were not printed.

| Module | Endpoint | Same internal credential works? | Status |
|---|---|---:|---:|
| Web loads | `/api/v2/order/list/full/?page=1&page_size=1&filter=[]&ordering=` | yes | 200 |
| Invoice batches | `/api/v1/invoice/batches/list/?page=1&page_size=1&filter=[]&ordering=` | yes | 200 |
| Driver settlements | `/api/v1/salary/batches/list/?page=1&page_size=1&filter=[]&ordering=` | yes | 200 |
| Customers | `/api/v1/customer/?page=1&page_size=1&filter=[]&ordering=` | yes | 200 |
| Fuel | `/api/v1/fuel/transactions/?ordering=&page=1&page_size=1&filter=[]` | yes | 200 |
| Toll | `/api/v1/toll/transactions/?ordering=&page=1&page_size=1&filter=[]` | yes | 200 |

## Open API Token vs Internal Auth

| Endpoint | Open API token | Internal auth | Browser session |
|---|---:|---:|---:|
| `/api/v1/openapi/orders/` | 200 | not required for current connector | not required |
| `/api/v1/invoice/batches/list/` | 401 | 200 | 200 |
| `/api/v1/salary/batches/list/` | 401 | 200 | 200 |
| `/api/v1/customer/` | 401 | 200 | 200 |
| `/api/v1/fuel/transactions/` | 401 | 200 | 200 |

## Supported Login API Assessment

Classification: `NORMAL_API_LOGIN` with AWS Cognito, plus Datatruck tenant discovery and Datatruck authorization exchange.

Observed pieces:

- Tenant discovery endpoint: `GET https://api.datatruck.io/api/clients/tenant-login/`
- Cognito login endpoint: `POST https://cognito-idp.us-east-2.amazonaws.com/`
- Datatruck authorize endpoint: `POST https://{company}.datatruck.io/api/v1/auth/authorize/`
- Refresh endpoint: `POST https://cognito-idp.us-east-2.amazonaws.com/`
- Refresh flow: `REFRESH_TOKEN_AUTH`

The inspected login response indicated tenant settings include `force_2fa` and `user_2fa_enabled`. MFA can therefore be required by tenant/user policy. This audit did not attempt to bypass MFA.

## Multi-Tenant Feasibility

Classification: `POSSIBLE_WITH_EXPLICIT_USER_LOGIN`.

Neuron could theoretically support this per workspace if:

- Each workspace connects its own Datatruck account.
- Neuron never reuses one company's internal token across workspaces.
- Cognito refresh tokens are encrypted per workspace.
- Access tokens are refreshed server-side with `REFRESH_TOKEN_AUTH`.
- Disconnect deletes all Datatruck internal credentials for that workspace.
- Neuron handles tenant/user MFA requirements through an explicit interactive login flow.
- Datatruck confirms this web-app auth/API usage is permitted for server-side integrations.

This should not be treated as `SAFE_FOR_SERVER_CONNECTOR` until Datatruck confirms support, token revocation expectations, rate limits, and terms of use for internal endpoints.

## Recommended Architecture

Recommended path:

1. Prefer Datatruck official partner/private API access for the missing modules.
2. If Datatruck approves web-app token based access, build an explicit per-workspace Datatruck login connector:
   - User enters Datatruck company/tenant.
   - Neuron performs tenant discovery.
   - User completes Datatruck/Cognito login and MFA when required.
   - Neuron stores only the refresh credential encrypted per workspace.
   - Neuron derives short-lived access credentials server-side.
   - Sync calls only observed/approved internal endpoints.
   - Disconnect deletes encrypted refresh credentials and internal sync state.
3. Keep the existing Open API connector for the six official endpoints.

Do not build a production connector that depends on a local browser profile, copied cookies, copied Authorization values, or one user's personal Datatruck session.

## Risks

- Internal endpoints may change without notice.
- Internal endpoints may not be covered by Datatruck's public API contract.
- MFA or tenant policy can block non-interactive server refresh/login flows.
- Refresh token revocation and rotation semantics need confirmation from Datatruck.
- Some internal endpoints may expose broader data than the official Open API; permissions must be mapped carefully.
- Per-workspace credential encryption, audit logging, revocation, and disconnect behavior are required before production use.

## Conclusion

The missing Datatruck modules are not absent because Neuron chose the wrong Open API paths. They are served by Datatruck web-app/internal APIs that use Datatruck/Cognito Bearer credentials, while the current Neuron connector uses the official Open API token. Production support for these modules needs either official Datatruck API coverage or a carefully designed, approved per-workspace Datatruck auth connector.
