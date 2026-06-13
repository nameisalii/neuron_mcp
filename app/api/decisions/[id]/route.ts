import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const PatchSchema = z
  .object({
    reason: z.string().min(1).max(1000).optional(),
    alternatives: z.string().min(1).max(500).optional(),
  })
  .refine((d) => d.reason !== undefined || d.alternatives !== undefined, {
    message: 'At least one field must be provided',
  })

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    if (!user?.workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const item = await prisma.knowledgeItem.findFirst({
      where: { id: params.id, workspaceId: user.workspace.id, category: 'decision' },
      select: { id: true },
    })
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { reason, alternatives } = parsed.data
    const updated = await prisma.knowledgeItem.update({
      where: { id: item.id },
      data: {
        ...(reason !== undefined && { reason }),
        ...(alternatives !== undefined && { alternatives }),
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[decisions/patch]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
