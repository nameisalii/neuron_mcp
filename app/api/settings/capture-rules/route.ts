import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])
const WRITE_ROLES = new Set(['owner', 'admin'])

const CreateRuleSchema = z.object({
  integration: z.enum(['notion', 'slack']),
  ruleType: z.enum(['include', 'exclude']),
  target: z.string().min(1).max(500),
  targetName: z.string().min(1).max(200),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const { id: workspaceId } = user.workspace

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    })
    if (!member || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rules = await prisma.captureRule.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ data: rules, meta: { total: rules.length } })
  } catch (err) {
    console.error('[settings/capture-rules GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    if (!user?.workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const { id: workspaceId } = user.workspace

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    })
    if (!member || !WRITE_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = CreateRuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const rule = await prisma.captureRule.create({
      data: { workspaceId, createdBy: userId, ...parsed.data },
    })

    return NextResponse.json({ data: rule }, { status: 201 })
  } catch (err) {
    console.error('[settings/capture-rules POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
