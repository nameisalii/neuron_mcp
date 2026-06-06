import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: { digestId: string } }) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const digest = await prisma.digest.findUnique({ where: { id: params.digestId } })
    if (!digest || digest.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!digest.readAt) {
      await prisma.digest.update({ where: { id: params.digestId }, data: { readAt: new Date() } })
    }
    return NextResponse.json({ data: digest })
  } catch (err) {
    console.error('[digest/:id GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
