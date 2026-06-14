import { decrypt } from '@/lib/crypto'
import { isIntegrationConnected } from './connection'

interface IntegrationCredential {
  type: string
  accessToken?: string | null
  metadata?: unknown
}

interface NotionConnectionContext {
  currentUserId: string
  workspaceType?: string | null
  workspaceOwnerClerkId?: string | null
}

export function getConnectedIntegrationToken(
  integration: IntegrationCredential | null | undefined,
  notionContext?: NotionConnectionContext,
): string | null {
  if (!isIntegrationConnected(integration, notionContext)) return null

  try {
    return decrypt(integration!.accessToken!).trim() || null
  } catch {
    return null
  }
}
