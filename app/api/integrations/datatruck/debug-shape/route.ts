import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { decrypt } from '@/lib/crypto'
import {
  datatruckEndpointPath,
  datatruckRequest,
  getDatatruckEnvConfig,
  summarizeDatatruckShape,
  type DatatruckConnection,
  type DatatruckEndpointKey,
} from '@/lib/datatruck/client'

async function datatruckDebugConnection(workspaceId: string): Promise<DatatruckConnection | null> {
  const connector = await prisma.apiConnector.findUnique({
    where: { workspaceId_sourceKey: { workspaceId, sourceKey: 'datatruck' } },
    select: { apiBaseUrl: true, encryptedCredential: true, metadata: true },
  })

  if (connector?.apiBaseUrl && connector.encryptedCredential) {
    try {
      return { apiBaseUrl: connector.apiBaseUrl, apiToken: decrypt(connector.encryptedCredential) }
    } catch {
      return null
    }
  }

  const env = getDatatruckEnvConfig()
  if (env.apiBaseUrl && env.apiToken) return { apiBaseUrl: env.apiBaseUrl, apiToken: env.apiToken }
  return null
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  const url = new URL(req.url)
  const endpointKey = url.searchParams.get('endpointKey') as DatatruckEndpointKey | null
  const explicitPath = url.searchParams.get('path')
  const path = explicitPath?.trim() || (endpointKey ? datatruckEndpointPath(endpointKey) : null) || '/orders/'
  const connection = await datatruckDebugConnection(workspace.workspaceId)
  if (!connection) return NextResponse.json({ error: 'Datatruck is not connected.' }, { status: 404 })

  const response = await datatruckRequest(connection, path)
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  return NextResponse.json({
    success: response.ok,
    endpointKey: endpointKey ?? null,
    path,
    shape: summarizeDatatruckShape(response.status, payload),
    error: response.ok ? null : `Datatruck responded with HTTP ${response.status}`,
  }, { status: response.ok ? 200 : 502 })
}
