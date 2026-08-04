export interface PublicTelegramPost {
  messageId: string
  text: string
  url: string
  publishedAt: Date | null
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizePublicTelegramChannelUrl(input: string): {
  username: string
  url: string
  previewUrl: string
} {
  const raw = input.trim()
  const candidate = raw.startsWith('@')
    ? `https://t.me/${raw.slice(1)}`
    : /^t\.me\//i.test(raw) ? `https://${raw}` : raw
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error('Enter a public t.me channel link.')
  }
  if (parsed.protocol !== 'https:' || !['t.me', 'www.t.me'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('Only public t.me channel links are supported.')
  }
  const parts = parsed.pathname.split('/').filter(Boolean)
  const username = parts[0]
  if (
    parts.length !== 1
    || !username
    || username.startsWith('+')
    || ['joinchat', 'c', 's'].includes(username.toLowerCase())
    || !/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(username)
  ) {
    throw new Error('Private invite links and message links are not supported.')
  }
  return {
    username,
    url: `https://t.me/${username}`,
    previewUrl: `https://t.me/s/${username}`,
  }
}

export function publicTelegramImportLimit(): number {
  const value = Number.parseInt(process.env.TELEGRAM_PUBLIC_IMPORT_MAX_POSTS ?? '50', 10)
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 100) : 50
}

export async function fetchPublicTelegramChannel(input: string, limit = publicTelegramImportLimit()): Promise<{
  username: string
  url: string
  posts: PublicTelegramPost[]
}> {
  const channel = normalizePublicTelegramChannelUrl(input)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  const response = await fetch(channel.previewUrl, {
    headers: { 'User-Agent': 'Neuron public Telegram channel importer/1.0' },
    signal: controller.signal,
    cache: 'no-store',
  }).finally(() => clearTimeout(timeout))
  if (!response.ok) throw new Error('This public Telegram channel could not be accessed.')
  const html = await response.text()
  const starts = [...html.matchAll(/data-post=["']([^/"']+)\/(\d+)["']/g)]
  const posts: PublicTelegramPost[] = []
  for (let index = 0; index < starts.length; index++) {
    const match = starts[index]
    if (match.index === undefined || match[1].toLowerCase() !== channel.username.toLowerCase()) continue
    const block = html.slice(match.index, starts[index + 1]?.index ?? html.length)
    const textMatch = block.match(/class=["'][^"']*tgme_widget_message_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
    const text = textMatch ? decodeHtml(textMatch[1]) : ''
    if (!text) continue
    const dateValue = block.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1]
    const publishedAt = dateValue && !Number.isNaN(new Date(dateValue).getTime()) ? new Date(dateValue) : null
    posts.push({
      messageId: match[2],
      text,
      url: `https://t.me/${channel.username}/${match[2]}`,
      publishedAt,
    })
  }
  posts.sort((a, b) => Number(b.messageId) - Number(a.messageId))
  return { username: channel.username, url: channel.url, posts: posts.slice(0, Math.min(limit, 100)) }
}

export async function importPublicTelegramChannel(input: {
  workspaceId: string
  userId: string
  url: string
  visibility?: 'team' | 'personal'
}) {
  const [{ createHash }, { prisma }, { generateEmbedding }, { upsertEmbedding }] = await Promise.all([
    import('node:crypto'),
    import('@/lib/db'),
    import('@/lib/openai'),
    import('@/lib/pinecone'),
  ])
  const channel = await fetchPublicTelegramChannel(input.url)
  let created = 0
  let duplicates = 0
  for (const post of channel.posts) {
    const sourceExternalId = `public:${channel.username.toLowerCase()}:${post.messageId}`
    const contentHash = `telegram:${createHash('sha256').update(`${input.workspaceId}:${sourceExternalId}`).digest('hex')}`
    try {
      const item = await prisma.knowledgeItem.create({
        data: {
          workspaceId: input.workspaceId,
          content: post.text,
          contentHash,
          category: 'fact',
          aiSuggestedCategory: 'fact',
          source: 'telegram',
          sourceExternalId,
          sourceUrl: post.url,
          sourceMetadata: {
            provider: 'telegram',
            mode: 'telegram_public_channel_import',
            channelUsername: channel.username,
            sourceUrl: post.url,
            messageId: post.messageId,
          },
          confidence: 0.55,
          visibility: input.visibility ?? 'team',
          visibilitySetBy: input.visibility === 'personal' ? input.userId : null,
          sourceCreatedAt: post.publishedAt,
        },
      })
      created++
      try {
        const embedding = await generateEmbedding(post.text)
        await upsertEmbedding(item.id, embedding, {
          workspaceId: input.workspaceId,
          category: 'fact',
          source: 'telegram',
        })
        await prisma.knowledgeItem.update({ where: { id: item.id }, data: { embeddingId: item.id } })
      } catch {
        // The imported post remains available in Postgres if search indexing is temporarily unavailable.
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') duplicates++
      else throw error
    }
  }
  return { username: channel.username, sourceUrl: channel.url, fetched: channel.posts.length, created, duplicates }
}
