import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { decrypt } from '@/lib/crypto'
import { buildDatatruckUrl, datatruckRequest } from '@/lib/datatruck/client'

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`
  if (value && typeof value === 'object') return 'object'
  return typeof value
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

  const connector = await prisma.apiConnector.findUnique({
    where: { workspaceId_sourceKey: { workspaceId: workspace.workspaceId, sourceKey: 'datatruck' } },
    select: { apiBaseUrl: true, encryptedCredential: true },
  })

  if (!connector?.apiBaseUrl || !connector.encryptedCredential) {
    return NextResponse.json({ error: 'Datatruck is not connected.' }, { status: 404 })
  }

  let apiToken: string
  try {
    apiToken = decrypt(connector.encryptedCredential)
  } catch {
    return NextResponse.json({ error: 'Datatruck connection is corrupted.' }, { status: 422 })
  }

  const response = await datatruckRequest(
    { apiBaseUrl: connector.apiBaseUrl, apiToken },
    buildDatatruckUrl({ apiBaseUrl: connector.apiBaseUrl }, '/orders/'),
  )
  if (!response.ok) {
    return NextResponse.json({ error: `Datatruck responded with HTTP ${response.status}` }, { status: 502 })
  }

  const payload = (await response.json()) as unknown
  const topLevelKeys = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.keys(payload as Record<string, unknown>)
    : []
  const results = payload && typeof payload === 'object' && !Array.isArray(payload) && Array.isArray((payload as Record<string, unknown>).results)
    ? (payload as Record<string, unknown>).results as unknown[]
    : Array.isArray(payload)
      ? payload
      : []
  const firstResult = results[0]
  const firstResultKeys = firstResult && typeof firstResult === 'object' && !Array.isArray(firstResult)
    ? Object.keys(firstResult as Record<string, unknown>).slice(0, 40)
    : []
  const nestedKeys = firstResult && typeof firstResult === 'object' && !Array.isArray(firstResult)
    ? Object.fromEntries(Object.entries(firstResult as Record<string, unknown>).map(([key, value]) => [key, summarizeValue(value)]))
    : {}

  return NextResponse.json({
    success: true,
    endpoint: 'loads',
    topLevelKeys,
    resultCount: results.length,
    firstResultKeys,
    nestedKeys,
  })
}
