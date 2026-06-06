import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const UpdateSchema = z.object({
  type: z.enum(['solo', 'team']).optional(),
  name: z.string().min(1).max(100).optional(),
  iconUrl: z.string().url().optional(),
})

export async function PATCH(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const workspace = await prisma.workspace.findUnique({ where: { ownerId: userId } })
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

  const updated = await prisma.workspace.update({
    where: { id: workspace.id },
    data: parsed.data,
  })

  return NextResponse.json({ workspace: updated })
}

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await prisma.workspace.findUnique({
    where: { ownerId: userId },
    include: { members: { where: { status: 'active' } } },
  })
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

  return NextResponse.json({ workspace })
}
