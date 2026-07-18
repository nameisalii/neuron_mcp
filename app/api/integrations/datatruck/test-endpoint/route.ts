import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { decrypt } from '@/lib/crypto'
import { buildDatatruckUrl, datatruckAuthHeaders, getDatatruckEnvConfig, type DatatruckConnection } from '@/lib/datatruck/client'
import { detectDatatruckResponseShape } from '@/lib/datatruck/shape'
import { fetchDatatruckSafe, validateDatatruckEndpointInput } from '@/lib/datatruck/urlSafety'

export const runtime = 'nodejs'

const TestEndpointSchema = z.object({
  path: z.string().trim().min(1),
  authMode: z.enum(['token', 'none']).default('token'),
})

async function datatruckConnectionFor(workspaceId: string): Promise<DatatruckConnection | null> {
  const connector = await prisma.apiConnector.findUnique({
    where: { workspaceId_sourceKey: { workspaceId, sourceKey: 'datatruck' } },
    select: { apiBaseUrl: true, encryptedCredential: true },
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

function friendlyTestError(status: number, contentType: string | null): string | null {
  if (status === 401 || status === 403) {
    return 'Datatruck rejected the API token for this endpoint. It may require a different permission or auth mode.'
  }
  if (status === 404) return 'This endpoint was not found in Datatruck. Double-check the path from DevTools.'
  if (status >= 400) return `Datatruck responded with HTTP ${status}.`
  if (contentType && !contentType.includes('json')) {
    return 'This URL returned a web page, not JSON data. Frontend page URLs are not API endpoints — copy the Fetch/XHR request URL from DevTools instead.'
  }
  return null
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspace = await requireWorkspaceMember(userId)
    if ('error' in workspace) return NextResponse.json({ error: workspace.error }, { status: workspace.status })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = TestEndpointSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Endpoint path is required.' }, { status: 400 })

    const validated = validateDatatruckEndpointInput(parsed.data.path)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

    const connection = await datatruckConnectionFor(workspace.workspaceId)
    if (!connection) return NextResponse.json({ error: 'Datatruck is not connected.' }, { status: 404 })

    const url = validated.kind === 'full_url' ? validated.value : buildDatatruckUrl(connection, validated.value)
    const headers = parsed.data.authMode === 'none'
      ? { 'Content-Type': 'application/json' }
      : datatruckAuthHeaders(connection.apiToken)

    let result
    try {
      result = await fetchDatatruckSafe(url, headers)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed'
      return NextResponse.json({ success: false, error: `Could not reach Datatruck: ${message}` }, { status: 502 })
    }

    let payload: unknown = null
    try {
      payload = JSON.parse(result.bodyText)
    } catch {
      payload = null
    }

    const shape = detectDatatruckResponseShape(payload)
    const isJson = payload !== null
    const error = friendlyTestError(result.status, result.contentType)
    const success = result.status >= 200 && result.status < 300 && isJson

    return NextResponse.json({
      success,
      path: validated.kind === 'relative' ? validated.value : undefined,
      url: validated.kind === 'full_url' ? validated.value : undefined,
      httpStatus: result.status,
      contentType: result.contentType,
      authAccepted: result.status !== 401 && result.status !== 403,
      shape: shape.shape,
      recordCount: shape.recordCount,
      fieldNames: shape.fieldNames,
      pagination: shape.pagination,
      truncated: result.truncated,
      error: success ? null : error ?? 'The endpoint did not return usable JSON data.',
    }, { status: success ? 200 : 502 })
  } catch (err) {
    console.error('[datatruck/test-endpoint]', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Endpoint test failed. Try again.' }, { status: 500 })
  }
}
