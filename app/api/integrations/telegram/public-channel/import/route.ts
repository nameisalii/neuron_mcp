import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { importPublicTelegramChannel } from '@/lib/telegram/publicChannel'

const schema = z.object({
  url: z.string().min(1).max(200),
  visibility: z.enum(['team', 'personal']).default('team'),
})

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.TELEGRAM_PUBLIC_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Public Telegram channel import is not enabled.' }, { status: 404 })
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid public Telegram channel link.' }, { status: 400 })
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  if (!user?.workspace) return NextResponse.json({ error: 'No workspace found.' }, { status: 404 })
  try {
    const result = await importPublicTelegramChannel({
      workspaceId: user.workspace.id,
      userId,
      url: parsed.data.url,
      visibility: parsed.data.visibility,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Channel import failed.' }, { status: 400 })
  }
}
