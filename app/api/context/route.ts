import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateApiKey } from '@/lib/api-auth'

const VALID_CATEGORIES = ['rule', 'decision', 'process', 'idea', 'fact', 'reference', 'status_update', 'note'] as const
const SECTION_LABELS: Record<string, string> = {
  rule: 'Rules & Policies',
  decision: 'Key Decisions',
  process: 'Processes',
  idea: 'Ideas',
}

type KnowledgeRow = {
  id: string
  content: string
  category: string
  source: string
  owner: string | null
  verifiedAt: Date | null
}

function buildMarkdown(items: KnowledgeRow[], maxChars?: number): string {
  const byCategory: Record<string, KnowledgeRow[]> = {}
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = []
    byCategory[item.category].push(item)
  }

  const lines: string[] = [
    '## Company Knowledge Context',
    `Generated: ${new Date().toISOString()}`,
    `Items: ${items.length}`,
    '',
  ]

  for (const [cat, catItems] of Object.entries(byCategory)) {
    lines.push(`### ${SECTION_LABELS[cat] ?? cat}`)
    for (const item of catItems) {
      const parts: string[] = [item.content]
      if (item.owner) parts.push(`Owner: ${item.owner}`)
      parts.push(`Source: ${item.source}`)
      if (item.verifiedAt) {
        parts.push(`Verified: ${item.verifiedAt.toISOString().slice(0, 10)}`)
      }
      lines.push(`- ${parts.join(', ')}`)
    }
    lines.push('')
  }

  const full = lines.join('\n')
  if (maxChars !== undefined && full.length > maxChars) {
    return `${full.slice(0, maxChars)}\n\n[truncated]`
  }
  return full
}

export async function GET(req: NextRequest) {
  try {
    let workspaceId = validateApiKey(req)

    if (!workspaceId) {
      const { userId } = await auth()
      if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { workspace: { select: { id: true } } },
      })
      if (!user?.workspace) {
        return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
      }
      workspaceId = user.workspace.id
    }

    const { searchParams } = req.nextUrl
    const format = searchParams.get('format') === 'markdown' ? 'markdown' : 'json'
    const rawCategory = searchParams.get('category') ?? 'all'
    const rawMaxTokens = searchParams.get('maxTokens')

    const categoryFilter =
      rawCategory !== 'all' && (VALID_CATEGORIES as readonly string[]).includes(rawCategory)
        ? { category: rawCategory }
        : {}

    const MAX_TOKENS = 32_000
    const maxChars =
      rawMaxTokens && /^\d+$/.test(rawMaxTokens)
        ? Math.min(parseInt(rawMaxTokens, 10), MAX_TOKENS) * 4
        : undefined

    const items = await prisma.knowledgeItem.findMany({
      where: { workspaceId, verified: true, ...categoryFilter },
      orderBy: { category: 'asc' },
      take: 500,
      select: { id: true, content: true, category: true, source: true, owner: true, verifiedAt: true },
    })

    if (format === 'markdown') {
      const md = buildMarkdown(items, maxChars)
      return new Response(md, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    return NextResponse.json(items)
  } catch (err) {
    console.error('[context]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
