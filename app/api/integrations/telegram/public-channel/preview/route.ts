import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fetchPublicTelegramChannel } from '@/lib/telegram/publicChannel'

const schema = z.object({ url: z.string().min(1).max(200) })

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.TELEGRAM_PUBLIC_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Public Telegram channel import is not enabled.' }, { status: 404 })
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid public Telegram channel link.' }, { status: 400 })
  try {
    const channel = await fetchPublicTelegramChannel(parsed.data.url, 5)
    return NextResponse.json({
      username: channel.username,
      sourceUrl: channel.url,
      recentPosts: channel.posts.map((post) => ({
        messageId: post.messageId,
        text: post.text.slice(0, 280),
        sourceUrl: post.url,
        publishedAt: post.publishedAt?.toISOString() ?? null,
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Channel preview failed.' }, { status: 400 })
  }
}
