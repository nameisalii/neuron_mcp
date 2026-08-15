import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { getVisibleEvidence } from '@/lib/intelligence/evidenceService'

export async function GET(_: Request, { params }: { params: Promise<{ claimId: string }> }) { const { userId } = await auth(); if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const access = await requireWorkspaceMember(userId); if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status }); const result = await getVisibleEvidence((await params).claimId, access.workspaceId, userId); return result ? NextResponse.json(result) : NextResponse.json({ error: 'Not found' }, { status: 404 }) }
