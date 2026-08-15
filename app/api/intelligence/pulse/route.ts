import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { getPulse, type PulseWindow } from '@/lib/intelligence/pulseService'

export async function GET(request: NextRequest) { const { userId } = await auth(); if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const access = await requireWorkspaceMember(userId); if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status }); const requested = request.nextUrl.searchParams.get('window'); const window: PulseWindow = requested === 'today' || requested === '30d' || requested === 'lastVisit' ? requested : '7d'; return NextResponse.json(await getPulse(access.workspaceId, window)) }
