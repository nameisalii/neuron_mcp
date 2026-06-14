interface IntegrationConnection {
  type: string
  accessToken?: string | null
  metadata?: unknown
}

interface NotionConnectionContext {
  currentUserId: string
  workspaceType?: string | null
  workspaceOwnerClerkId?: string | null
}

const DISCONNECTED_STATUSES = new Set(['disconnected', 'error', 'revoked'])

function integrationStatus(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const status = (metadata as Record<string, unknown>).status
  return typeof status === 'string' ? status.toLowerCase() : null
}

export function isIntegrationConnected(
  integration: IntegrationConnection | null | undefined,
  notionContext?: NotionConnectionContext,
): boolean {
  if (!integration?.accessToken?.trim()) return false
  if (DISCONNECTED_STATUSES.has(integrationStatus(integration.metadata) ?? '')) return false

  if (integration.type === 'notion') {
    if (integration.accessToken === 'notion-static' || integration.accessToken === 'notion-server-token') return false
    if (integrationStatus(integration.metadata) !== 'connected') return false
    if (!notionContext) return true

    const metadata = integration.metadata as Record<string, unknown>
    const connectedBy = typeof metadata.connectedBy === 'string' ? metadata.connectedBy : null
    if (!connectedBy) return false
    if (notionContext.workspaceType === 'solo') {
      return connectedBy === notionContext.currentUserId
        && notionContext.workspaceOwnerClerkId === notionContext.currentUserId
    }
  }

  return true
}
