import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { resolveContradiction } from '@/lib/intelligence/contradictionService'
import { recordFeedback } from '@/lib/intelligence/feedbackService'
const schema = z.object({ action: z.enum(['SELECT_TRUTH', 'BOTH_VALID', 'IGNORE', 'MANUAL']), resolution: z.record(z.unknown()).default({}) })
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const { userId } = await auth(); if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const access = await requireWorkspaceMember(userId); if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status }); const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); const id = (await params).id; const result = await resolveContradiction(id, access.workspaceId, userId, parsed.data, parsed.data.action === 'IGNORE' ? 'IGNORED' : 'RESOLVED'); if (!result.count) return NextResponse.json({ error: 'Not found or already resolved' }, { status: 404 }); await recordFeedback({ workspaceId: access.workspaceId, targetType: 'contradiction', targetId: id, action: parsed.data.action, correctedValue: parsed.data.resolution as Prisma.JsonObject, userId }); return NextResponse.json({ ok: true }) }
