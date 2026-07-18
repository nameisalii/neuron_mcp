import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { decrypt, encrypt } from '@/lib/crypto'
import {
  buildDatatruckInternalBaseUrl,
  isValidDatatruckCompanyName,
  normalizeDatatruckCompanyName,
} from './client'

export type DatatruckConnectionMode = 'open_api' | 'full_account'

type DatatruckRecord = Record<string, unknown>

const COGNITO_ENDPOINT = 'https://cognito-idp.us-east-2.amazonaws.com/'
const COGNITO_TARGET = 'AWSCognitoIdentityProviderService.InitiateAuth'
const COGNITO_CHALLENGE_TARGET = 'AWSCognitoIdentityProviderService.RespondToAuthChallenge'
const DEFAULT_COGNITO_REGION = 'us-east-2'
const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000
const CHALLENGE_TTL_MS = 5 * 60 * 1000
const MAX_MFA_ATTEMPTS = 5

export function isDatatruckFullAccountEnabled(): boolean {
  return process.env.DATATRUCK_FULL_ACCOUNT_CONNECTOR_ENABLED === 'true'
}

export interface FullAccountCredentialBundle {
  mode: 'full_account'
  companyName: string
  cognitoClientId: string
  cognitoRegion: string
  cognitoRefreshToken: string
  datatruckAccessToken?: string
  accessExpiresAt?: string
  connectedAt: string
  authVersion: 1
}

interface TenantLookupResult {
  companyName: string
  cognitoClientId: string
  cognitoRegion: string
  force2fa: boolean | null
  user2faEnabled: boolean | null
}

interface CognitoAuthResult {
  status: 'success' | 'mfa_required'
  accessToken?: string
  idToken?: string
  refreshToken?: string
  expiresIn?: number
  challengeName?: string
  session?: string
  clientId: string
  region: string
  usernameOrEmail: string
  companyName: string
}

interface PendingMfaChallenge {
  workspaceId: string
  userId: string
  companyName: string
  usernameOrEmail: string
  clientId: string
  region: string
  challengeName: string
  session: string
  createdAt: number
  attempts: number
}

const pendingMfaChallenges = new Map<string, PendingMfaChallenge>()

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function safeBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function asRecord(value: unknown): DatatruckRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DatatruckRecord : null
}

function firstRecord(payload: unknown): DatatruckRecord | null {
  if (Array.isArray(payload)) return asRecord(payload[0])
  const record = asRecord(payload)
  if (!record) return null
  if (Array.isArray(record.results)) return asRecord(record.results[0])
  if (Array.isArray(record.data)) return asRecord(record.data[0])
  return record
}

function nestedValue(record: DatatruckRecord, path: string[]): unknown {
  let current: unknown = record
  for (const segment of path) {
    const currentRecord = asRecord(current)
    if (!currentRecord) return undefined
    current = currentRecord[segment]
  }
  return current
}

function firstNestedString(record: DatatruckRecord, paths: string[][]): string | null {
  for (const path of paths) {
    const value = safeString(nestedValue(record, path))
    if (value) return value
  }
  return null
}

function decodeJwtExpiry(token: string | undefined, fallbackSeconds?: number): Date {
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: unknown }
      if (typeof payload.exp === 'number') return new Date(payload.exp * 1000)
    } catch {
      // Fall through to a conservative fallback.
    }
  }
  return new Date(Date.now() + (fallbackSeconds ?? 3600) * 1000)
}

function pruneExpiredChallenges(now = Date.now()): void {
  for (const [id, challenge] of pendingMfaChallenges.entries()) {
    if (now - challenge.createdAt > CHALLENGE_TTL_MS || challenge.attempts >= MAX_MFA_ATTEMPTS) {
      pendingMfaChallenges.delete(id)
    }
  }
}

export function clearDatatruckFullAccountChallenge(challengeId: string): void {
  pendingMfaChallenges.delete(challengeId)
}

function storeMfaChallenge(challenge: Omit<PendingMfaChallenge, 'createdAt' | 'attempts'>): string {
  pruneExpiredChallenges()
  const challengeId = crypto.randomBytes(24).toString('base64url')
  pendingMfaChallenges.set(challengeId, { ...challenge, createdAt: Date.now(), attempts: 0 })
  return challengeId
}

export async function lookupDatatruckTenant(params: {
  company?: string
  usernameOrEmail: string
}): Promise<TenantLookupResult> {
  const usernameOrEmail = params.usernameOrEmail.trim()
  if (!usernameOrEmail) throw new Error('Datatruck username or email is required.')
  const url = new URL('https://api.datatruck.io/api/clients/tenant-login/')
  url.searchParams.set('search', usernameOrEmail)
  const response = await fetch(url, { method: 'GET', cache: 'no-store' })
  if (!response.ok) throw new Error('Datatruck tenant lookup failed.')
  const payload = await response.json() as unknown
  const tenant = firstRecord(payload)
  if (!tenant) throw new Error('Datatruck tenant was not found.')

  const companyName = normalizeDatatruckCompanyName(
    params.company
      ?? safeString(tenant.schema_name)
      ?? safeString(tenant.company)
      ?? safeString(tenant.company_name)
      ?? '',
  )
  if (!isValidDatatruckCompanyName(companyName)) throw new Error('Datatruck returned an unsupported company name.')

  const cognitoClientId = firstNestedString(tenant, [
    ['cognito', 'client_id'],
    ['cognito', 'clientId'],
    ['cognito', 'app_client_id'],
    ['cognito', 'appClientId'],
    ['cognito_client_id'],
    ['client_id'],
    ['clientId'],
  ])
  if (!cognitoClientId) throw new Error('Datatruck tenant response is missing Cognito client configuration.')

  const cognitoRegion = firstNestedString(tenant, [
    ['cognito', 'region'],
    ['cognito', 'aws_region'],
    ['cognito', 'awsRegion'],
    ['region'],
  ]) ?? DEFAULT_COGNITO_REGION

  return {
    companyName,
    cognitoClientId,
    cognitoRegion,
    force2fa: safeBoolean(tenant.force_2fa),
    user2faEnabled: safeBoolean(tenant.user_2fa_enabled),
  }
}

async function cognitoRequest<T>(target: string, body: Record<string, unknown>, region: string): Promise<T> {
  const endpoint = region === DEFAULT_COGNITO_REGION
    ? COGNITO_ENDPOINT
    : `https://cognito-idp.${region}.amazonaws.com/`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': target,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as T
  if (!response.ok) throw new Error('Datatruck authentication failed.')
  return payload
}

function parseCognitoAuthResult(payload: DatatruckRecord, context: {
  clientId: string
  region: string
  usernameOrEmail: string
  companyName: string
}): CognitoAuthResult {
  const auth = asRecord(payload.AuthenticationResult)
  if (auth) {
    const accessToken = safeString(auth.AccessToken)
    const idToken = safeString(auth.IdToken)
    const refreshToken = safeString(auth.RefreshToken)
    if (!accessToken || !idToken) throw new Error('Datatruck authentication response was incomplete.')
    return {
      status: 'success',
      accessToken,
      idToken,
      refreshToken: refreshToken ?? undefined,
      expiresIn: typeof auth.ExpiresIn === 'number' ? auth.ExpiresIn : undefined,
      clientId: context.clientId,
      region: context.region,
      usernameOrEmail: context.usernameOrEmail,
      companyName: context.companyName,
    }
  }

  const challengeName = safeString(payload.ChallengeName)
  const session = safeString(payload.Session)
  if (challengeName && session) {
    return {
      status: 'mfa_required',
      challengeName,
      session,
      clientId: context.clientId,
      region: context.region,
      usernameOrEmail: context.usernameOrEmail,
      companyName: context.companyName,
    }
  }
  throw new Error('Datatruck authentication response was unsupported.')
}

export async function initiateDatatruckCognitoLogin(params: {
  company?: string
  usernameOrEmail: string
  password: string
}): Promise<CognitoAuthResult & Pick<TenantLookupResult, 'force2fa' | 'user2faEnabled'>> {
  const usernameOrEmail = params.usernameOrEmail.trim()
  if (!usernameOrEmail || !params.password) throw new Error('Datatruck username and password are required.')
  const tenant = await lookupDatatruckTenant({ company: params.company, usernameOrEmail })
  const payload = await cognitoRequest<DatatruckRecord>(COGNITO_TARGET, {
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: usernameOrEmail,
      PASSWORD: params.password,
    },
    ClientMetadata: {
      schema_name: tenant.companyName,
    },
    ClientId: tenant.cognitoClientId,
  }, tenant.cognitoRegion)
  return {
    ...parseCognitoAuthResult(payload, {
      clientId: tenant.cognitoClientId,
      region: tenant.cognitoRegion,
      usernameOrEmail,
      companyName: tenant.companyName,
    }),
    force2fa: tenant.force2fa,
    user2faEnabled: tenant.user2faEnabled,
  }
}

export async function respondToDatatruckMfaChallenge(params: {
  challengeId: string
  code: string
  workspaceId: string
  userId: string
}): Promise<CognitoAuthResult> {
  pruneExpiredChallenges()
  const challenge = pendingMfaChallenges.get(params.challengeId)
  if (!challenge || challenge.workspaceId !== params.workspaceId || challenge.userId !== params.userId) {
    throw new Error('Datatruck MFA challenge expired. Start again.')
  }
  challenge.attempts += 1
  if (challenge.attempts > MAX_MFA_ATTEMPTS) {
    pendingMfaChallenges.delete(params.challengeId)
    throw new Error('Too many MFA attempts. Start again.')
  }

  const code = params.code.trim()
  if (!code) throw new Error('MFA code is required.')
  const codeField = challenge.challengeName === 'SMS_MFA'
    ? 'SMS_MFA_CODE'
    : challenge.challengeName === 'SOFTWARE_TOKEN_MFA'
      ? 'SOFTWARE_TOKEN_MFA_CODE'
      : 'ANSWER'

  const payload = await cognitoRequest<DatatruckRecord>(COGNITO_CHALLENGE_TARGET, {
    ChallengeName: challenge.challengeName,
    ClientId: challenge.clientId,
    Session: challenge.session,
    ChallengeResponses: {
      USERNAME: challenge.usernameOrEmail,
      [codeField]: code,
    },
  }, challenge.region)

  const result = parseCognitoAuthResult(payload, {
    clientId: challenge.clientId,
    region: challenge.region,
    usernameOrEmail: challenge.usernameOrEmail,
    companyName: challenge.companyName,
  })
  if (result.status === 'success') pendingMfaChallenges.delete(params.challengeId)
  return result
}

export async function exchangeForDatatruckToken(params: {
  companyName: string
  cognitoAccessToken: string
}): Promise<{ accessToken: string; expiresAt: Date }> {
  const companyName = normalizeDatatruckCompanyName(params.companyName)
  if (!isValidDatatruckCompanyName(companyName)) throw new Error('Invalid Datatruck company name.')
  const response = await fetch(`${buildDatatruckInternalBaseUrl(companyName)}/api/v1/auth/authorize/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.cognitoAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ access_token: params.cognitoAccessToken }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as DatatruckRecord
  if (!response.ok) throw new Error('Datatruck authorization exchange failed.')
  const result = asRecord(payload.result)
  const session = safeString(result?.session) ?? safeString(payload.session)
  const accessToken = session ?? params.cognitoAccessToken
  const expiresAt = safeString(payload.expires_at)
    ? new Date(String(payload.expires_at))
    : decodeJwtExpiry(accessToken)
  return {
    accessToken,
    expiresAt: Number.isNaN(expiresAt.getTime()) ? decodeJwtExpiry(accessToken) : expiresAt,
  }
}

function encodeCredentialBundle(bundle: FullAccountCredentialBundle): string {
  return encrypt(JSON.stringify(bundle))
}

export function decodeDatatruckCredentialBundle(encryptedCredential: string): FullAccountCredentialBundle {
  const parsed = JSON.parse(decrypt(encryptedCredential)) as FullAccountCredentialBundle
  if (parsed.mode !== 'full_account' || !parsed.companyName || !parsed.cognitoRefreshToken || !parsed.cognitoClientId) {
    throw new Error('Invalid Datatruck full-account credential bundle.')
  }
  return parsed
}

export async function persistFullAccountConnector(params: {
  workspaceId: string
  companyName: string
  clientId: string
  region: string
  cognitoRefreshToken: string
  datatruckAccessToken: string
  accessExpiresAt: Date
  metadata?: Record<string, unknown>
}): Promise<void> {
  const companyName = normalizeDatatruckCompanyName(params.companyName)
  const credential: FullAccountCredentialBundle = {
    mode: 'full_account',
    companyName,
    cognitoClientId: params.clientId,
    cognitoRegion: params.region,
    cognitoRefreshToken: params.cognitoRefreshToken,
    datatruckAccessToken: params.datatruckAccessToken,
    accessExpiresAt: params.accessExpiresAt.toISOString(),
    connectedAt: new Date().toISOString(),
    authVersion: 1,
  }
  await prisma.apiConnector.upsert({
    where: { workspaceId_sourceKey: { workspaceId: params.workspaceId, sourceKey: 'datatruck' } },
    create: {
      workspaceId: params.workspaceId,
      name: 'Datatruck',
      sourceKey: 'datatruck',
      apiBaseUrl: buildDatatruckInternalBaseUrl(companyName),
      authType: 'full_account',
      encryptedCredential: encodeCredentialBundle(credential),
      status: 'connected',
      metadata: {
        ...params.metadata,
        mode: 'full_account',
        companyName,
        authScheme: 'Bearer',
        authVersion: 1,
        connectedAt: credential.connectedAt,
        accessExpiresAt: credential.accessExpiresAt,
      } as Prisma.InputJsonValue,
    },
    update: {
      apiBaseUrl: buildDatatruckInternalBaseUrl(companyName),
      authType: 'full_account',
      encryptedCredential: encodeCredentialBundle(credential),
      status: 'connected',
      metadata: {
        ...params.metadata,
        mode: 'full_account',
        companyName,
        authScheme: 'Bearer',
        authVersion: 1,
        connectedAt: credential.connectedAt,
        accessExpiresAt: credential.accessExpiresAt,
      } as Prisma.InputJsonValue,
    },
  })
}

export async function refreshCognitoAccessToken(bundle: FullAccountCredentialBundle): Promise<{
  accessToken: string
  idToken: string
  expiresAt: Date
}> {
  const payload = await cognitoRequest<DatatruckRecord>(COGNITO_TARGET, {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: bundle.cognitoClientId,
    AuthParameters: {
      REFRESH_TOKEN: bundle.cognitoRefreshToken,
    },
  }, bundle.cognitoRegion)
  const auth = asRecord(payload.AuthenticationResult)
  const accessToken = safeString(auth?.AccessToken)
  const idToken = safeString(auth?.IdToken)
  if (!accessToken || !idToken) throw new Error('Datatruck refresh response was incomplete.')
  return {
    accessToken,
    idToken,
    expiresAt: decodeJwtExpiry(accessToken, typeof auth?.ExpiresIn === 'number' ? auth.ExpiresIn : undefined),
  }
}

export async function getValidDatatruckInternalAccessToken(workspaceId: string): Promise<string> {
  const connector = await prisma.apiConnector.findUnique({
    where: { workspaceId_sourceKey: { workspaceId, sourceKey: 'datatruck' } },
    select: { id: true, encryptedCredential: true, authType: true, metadata: true },
  })
  if (!connector?.encryptedCredential || connector.authType !== 'full_account') {
    throw new Error('Datatruck full account is not connected.')
  }
  const bundle = decodeDatatruckCredentialBundle(connector.encryptedCredential)
  const expiresAt = bundle.accessExpiresAt ? new Date(bundle.accessExpiresAt) : null
  if (bundle.datatruckAccessToken && expiresAt && expiresAt.getTime() - Date.now() > ACCESS_TOKEN_SKEW_MS) {
    return bundle.datatruckAccessToken
  }

  const cognito = await refreshCognitoAccessToken(bundle)
  const datatruck = await exchangeForDatatruckToken({
    companyName: bundle.companyName,
    cognitoAccessToken: cognito.accessToken,
  })
  const nextBundle: FullAccountCredentialBundle = {
    ...bundle,
    datatruckAccessToken: datatruck.accessToken,
    accessExpiresAt: datatruck.expiresAt.toISOString(),
  }
  const metadata = connector.metadata && typeof connector.metadata === 'object' && !Array.isArray(connector.metadata)
    ? connector.metadata as Record<string, unknown>
    : {}
  await prisma.apiConnector.update({
    where: { id: connector.id },
    data: {
      encryptedCredential: encodeCredentialBundle(nextBundle),
      metadata: {
        ...metadata,
        accessExpiresAt: nextBundle.accessExpiresAt,
        refreshedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  })
  return datatruck.accessToken
}

export async function completeFullAccountConnection(params: {
  workspaceId: string
  cognito: Extract<CognitoAuthResult, { status: 'success' }> | CognitoAuthResult
  metadata?: Record<string, unknown>
}): Promise<void> {
  if (params.cognito.status !== 'success' || !params.cognito.accessToken || !params.cognito.refreshToken) {
    throw new Error('Datatruck full account login did not return refreshable credentials.')
  }
  const datatruck = await exchangeForDatatruckToken({
    companyName: params.cognito.companyName,
    cognitoAccessToken: params.cognito.accessToken,
  })
  await persistFullAccountConnector({
    workspaceId: params.workspaceId,
    companyName: params.cognito.companyName,
    clientId: params.cognito.clientId,
    region: params.cognito.region,
    cognitoRefreshToken: params.cognito.refreshToken,
    datatruckAccessToken: datatruck.accessToken,
    accessExpiresAt: datatruck.expiresAt,
    metadata: params.metadata,
  })
}

export function createFullAccountMfaChallenge(params: {
  workspaceId: string
  userId: string
  cognito: CognitoAuthResult
}): { challengeId: string; challengeType: string } {
  if (params.cognito.status !== 'mfa_required' || !params.cognito.challengeName || !params.cognito.session) {
    throw new Error('Datatruck MFA challenge is missing.')
  }
  return {
    challengeId: storeMfaChallenge({
      workspaceId: params.workspaceId,
      userId: params.userId,
      companyName: params.cognito.companyName,
      usernameOrEmail: params.cognito.usernameOrEmail,
      clientId: params.cognito.clientId,
      region: params.cognito.region,
      challengeName: params.cognito.challengeName,
      session: params.cognito.session,
    }),
    challengeType: params.cognito.challengeName,
  }
}
