import { auth } from '@clerk/nextjs/server'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { encrypt } from '@/lib/crypto'
import {
  buildDatatruckApiBaseUrl,
  isValidDatatruckCompanyName,
  normalizeDatatruckCompanyName,
  safeDatatruckMetadata,
  sanitizeDatatruckEndpointMapping,
} from '@/lib/datatruck/client'

const ConfigureSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  apiToken: z.string().trim().min(1, 'API token is required'),
})

const EndpointMappingSchema = z.object({
  endpointMapping: z.record(z.string(), z.string().trim()).default({}),
})

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

    const parsed = ConfigureSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Company name and API token are required.' }, { status: 400 })
    }

    const companyName = normalizeDatatruckCompanyName(parsed.data.companyName)
    if (!isValidDatatruckCompanyName(companyName)) {
      return NextResponse.json(
        { error: 'Enter a valid Datatruck company name using lowercase letters, numbers, and hyphens.' },
        { status: 400 },
      )
    }

    const apiBaseUrl = buildDatatruckApiBaseUrl(companyName)
    const encryptedCredential = encrypt(parsed.data.apiToken)
    const metadata = safeDatatruckMetadata(companyName)

    const connector = await prisma.apiConnector.upsert({
      where: { workspaceId_sourceKey: { workspaceId: workspace.workspaceId, sourceKey: 'datatruck' } },
      create: {
        workspaceId: workspace.workspaceId,
        name: 'Datatruck',
        sourceKey: 'datatruck',
        apiBaseUrl,
        authType: 'api_token',
        encryptedCredential,
        status: 'connected',
        metadata,
      },
      update: {
        apiBaseUrl,
        authType: 'api_token',
        encryptedCredential,
        status: 'connected',
        metadata,
      },
      select: { id: true, status: true },
    })

    return NextResponse.json({
      success: true,
      message: 'Datatruck connected.',
      connector: { id: connector.id, status: connector.status, companyName },
    })
  } catch (err) {
    // Never log the request body here — it contains the API token.
    console.error('[datatruck/configure]', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Failed to connect Datatruck. Try again.' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
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

    const parsed = EndpointMappingSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid endpoint mapping.' }, { status: 400 })

    const connector = await prisma.apiConnector.findUnique({
      where: { workspaceId_sourceKey: { workspaceId: workspace.workspaceId, sourceKey: 'datatruck' } },
      select: { id: true, metadata: true },
    })
    if (!connector) return NextResponse.json({ error: 'Datatruck is not connected.' }, { status: 404 })

    const metadata = connector.metadata && typeof connector.metadata === 'object' && !Array.isArray(connector.metadata)
      ? connector.metadata as Record<string, unknown>
      : {}
    const endpointMapping = sanitizeDatatruckEndpointMapping(parsed.data.endpointMapping)

    await prisma.apiConnector.update({
      where: { id: connector.id },
      data: { metadata: { ...metadata, endpointMapping } as Prisma.InputJsonValue },
    })

    return NextResponse.json({ success: true, endpointMapping })
  } catch (err) {
    console.error('[datatruck/configure:endpoints]', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.json({ error: 'Failed to save Datatruck endpoint mapping.' }, { status: 500 })
  }
}
