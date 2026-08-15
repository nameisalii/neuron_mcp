import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { recordFeedback } from '@/lib/intelligence/feedbackService'
const schema = z.object({ targetType: z.enum(['knowledge', 'stale', 'relationship', 'decision', 'risk']), targetId: z.string().min(1), action: z.string().min(1).max(80), previousValue: z.unknown().optional(), correctedValue: z.unknown().optional() })
export async function POST(request: Request) { const { userId } = await auth(); if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const access = await requireWorkspaceMember(userId); if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status }); const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: 'Invalid feedback' }, { status: 400 }); return NextResponse.json(await recordFeedback({ ...parsed.data, previousValue: parsed.data.previousValue as Prisma.InputJsonValue, correctedValue: parsed.data.correctedValue as Prisma.InputJsonValue, workspaceId: access.workspaceId, userId }), { status: 201 }) }
