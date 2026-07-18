import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import {
  completeFullAccountConnection,
  isDatatruckFullAccountEnabled,
  respondToDatatruckMfaChallenge,
} from '@/lib/datatruck/auth'
import { normalizeDatatruckCompanyName, safeDatatruckFullAccountMetadata } from '@/lib/datatruck/client'

export const runtime = 'nodejs'

const MfaSchema = z.object({
  challengeId: z.string().trim().min(1),
  code: z.string().trim().min(1),
})

export async function POST(req: Request) {
  if (!isDatatruckFullAccountEnabled()) {
    return NextResponse.json({ status: 'error', message: 'Full Datatruck Account connector is not enabled.' }, { status: 404 })
  }

  const { userId } = await auth()
  if (!userId) return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })

  const workspace = await requireWorkspaceMember(userId)
  if ('error' in workspace) return NextResponse.json({ status: 'error', message: workspace.error }, { status: workspace.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ status: 'error', message: 'Invalid request body.' }, { status: 400 })
  }
  const parsed = MfaSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', message: 'MFA code is required.' }, { status: 400 })
  }

  try {
    const result = await respondToDatatruckMfaChallenge({
      challengeId: parsed.data.challengeId,
      code: parsed.data.code,
      workspaceId: workspace.workspaceId,
      userId,
    })
    await completeFullAccountConnection({
      workspaceId: workspace.workspaceId,
      cognito: result,
      metadata: safeDatatruckFullAccountMetadata(normalizeDatatruckCompanyName(result.companyName)),
    })
    return NextResponse.json({ status: 'connected' })
  } catch (error) {
    // Do not log MFA code, challenge session values, tokens, or raw provider payloads.
    console.error('[datatruck/full-account/mfa]', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not verify the Datatruck MFA code.',
    }, { status: 400 })
  }
}
