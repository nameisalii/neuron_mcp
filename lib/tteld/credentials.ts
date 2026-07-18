import { prisma } from '@/lib/db'
import { decrypt, encrypt } from '@/lib/crypto'
import type { TtEldCredentials } from './client'

export const TTELD_SOURCE = 'five_eld'
export const TTELD_CAPABILITIES = ['realtime_tracking', 'tracking_by_vin', 'current_units', 'drivers', 'historical_tracking', 'active_units'] as const

export function encodeTtEldCredentials(credentials: TtEldCredentials): string {
  return encrypt(JSON.stringify({ apiKey: credentials.apiKey.trim(), providerToken: credentials.providerToken?.trim() || null }))
}

export function decodeTtEldCredentials(encrypted: string, usdot: string): TtEldCredentials {
  try {
    const parsed = JSON.parse(decrypt(encrypted)) as { apiKey?: unknown; providerToken?: unknown }
    if (typeof parsed.apiKey !== 'string' || !parsed.apiKey) throw new Error()
    return { usdot, apiKey: parsed.apiKey, providerToken: typeof parsed.providerToken === 'string' ? parsed.providerToken : undefined }
  } catch { throw new Error('Five ELD credentials are unavailable. Reconnect Five ELD.') }
}

export async function loadTtEldConnection(workspaceId: string) {
  const connector = await prisma.apiConnector.findUnique({
    where: { workspaceId_sourceKey: { workspaceId, sourceKey: TTELD_SOURCE } },
    select: { id: true, encryptedCredential: true, metadata: true, status: true, lastSyncAt: true },
  })
  if (!connector?.encryptedCredential || connector.status === 'disconnected') {
    const companyId = process.env.FIVE_ELD_COMPANY_ID?.trim()
    const usdot = process.env.FIVE_ELD_USDOT?.trim()
    const apiKey = process.env.FIVE_ELD_API_KEY?.trim()
    if (!companyId || !usdot || !apiKey) return null
    return {
      connector: { id: 'five-eld-env', encryptedCredential: null, metadata: { companyId, usdot }, status: 'connected', lastSyncAt: null },
      credentials: { companyId, usdot, apiKey, providerToken: process.env.FIVE_ELD_PROVIDER_TOKEN?.trim() || undefined },
      metadata: { provider: TTELD_SOURCE, companyId, usdot, connectionMode: 'local_env' },
    }
  }
  const metadata = connector.metadata && typeof connector.metadata === 'object' && !Array.isArray(connector.metadata) ? connector.metadata as Record<string, unknown> : {}
  const usdot = typeof metadata.usdot === 'string' ? metadata.usdot : ''
  return { connector, credentials: { ...decodeTtEldCredentials(connector.encryptedCredential, usdot), companyId: typeof metadata.companyId === 'string' ? metadata.companyId : undefined }, metadata }
}
