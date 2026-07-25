import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const VerifySchema = z.object({
  id: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = VerifySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { email: true, workspace: { select: { id: true } } },
    })
    if (!user?.workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const item = await prisma.knowledgeItem.findFirst({
      where: { id: parsed.data.id, workspaceId: user.workspace.id },
      select: { id: true },
    })
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.knowledgeItem.update({
      where: { id: item.id },
      data: { verified: true, verifiedAt: new Date(), verifiedBy: user.email, frozen: true },
    })

    return NextResponse.json({ id: item.id, verified: true })
  } catch (err) {
    console.error('[knowledge/verify]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
