import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { knowledgeRequestContext } from '@/lib/knowledge/api'
import { knowledgeStatuses } from '@/lib/knowledge/validation'
import { normalizeKnowledgeItem } from '@/lib/knowledge/display'

export async function GET(req: Request) {
  const context = await knowledgeRequestContext()
  if (context.response) return context.response
  const params = new URL(req.url).searchParams
  const status = params.get('status')
  if (status && !knowledgeStatuses.includes(status as never)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const search = params.get('search')?.trim()
  const where: Prisma.KnowledgeItemWhereInput = {
    workspaceId: context.workspaceId,
    ...(params.get('source') ? { source: params.get('source')! } : {}),
    ...(params.get('category') ? { category: params.get('category')! } : {}),
    ...(search ? { OR: [
      { label: { contains: search, mode: 'insensitive' } }, { summary: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } }, { notionPageTitle: { contains: search, mode: 'insensitive' } },
    ] } : {}),
  }
  const rows = await prisma.knowledgeItem.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 200 })
  const items = rows.map(normalizeKnowledgeItem).filter(item => status ? item.displayStatus === status : item.displayStatus !== 'archived')
  return NextResponse.json({ items })
}
