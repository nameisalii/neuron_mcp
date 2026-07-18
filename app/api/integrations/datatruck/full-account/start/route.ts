import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import {
  completeFullAccountConnection,
  createFullAccountMfaChallenge,
  initiateDatatruckCognitoLogin,
  isDatatruckFullAccountEnabled,
} from '@/lib/datatruck/auth'
import { normalizeDatatruckCompanyName, safeDatatruckFullAccountMetadata } from '@/lib/datatruck/client'

export const runtime = 'nodejs'

const StartSchema = z.object({
  company: z.string().trim().optional(),
  usernameOrEmail: z.string().trim().min(1),
  password: z.string().min(1),
})

function friendlyDatatruckAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('tenant')) return 'Could not find that Datatruck tenant. Check the company or username.'
  if (message.includes('MFA')) return message
  if (message.includes('configuration')) return 'Datatruck returned an unsupported tenant configuration.'
  return 'Could not connect your full Datatruck account. Check your credentials and try again.'
}

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
  const parsed = StartSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', message: 'Datatruck username and password are required.' }, { status: 400 })
  }

  try {
    const result = await initiateDatatruckCognitoLogin(parsed.data)
    if (result.status === 'mfa_required') {
      const challenge = createFullAccountMfaChallenge({ workspaceId: workspace.workspaceId, userId, cognito: result })
      return NextResponse.json({
        status: 'mfa_required',
        challengeId: challenge.challengeId,
        challengeType: challenge.challengeType,
      })
    }

    await completeFullAccountConnection({
      workspaceId: workspace.workspaceId,
      cognito: result,
      metadata: safeDatatruckFullAccountMetadata(normalizeDatatruckCompanyName(result.companyName)),
    })
    return NextResponse.json({ status: 'connected' })
  } catch (error) {
    // Do not log body, password, MFA codes, tokens, or Datatruck raw auth payloads.
    console.error('[datatruck/full-account/start]', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json({ status: 'error', message: friendlyDatatruckAuthError(error) }, { status: 400 })
  }
}
