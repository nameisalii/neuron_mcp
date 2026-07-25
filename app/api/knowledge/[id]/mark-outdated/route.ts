import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { knowledgeRequestContext } from '@/lib/knowledge/api'
import { mergeKnowledgeMetadata } from '@/lib/knowledge/display'
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await knowledgeRequestContext(); if (context.response) return context.response
  const item = await prisma.knowledgeItem.findFirst({ where: { id: (await params).id, workspaceId: context.workspaceId }, select: { id: true, sourceMetadata: true } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item: await prisma.knowledgeItem.update({ where: { id: item.id }, data: { sourceMetadata: mergeKnowledgeMetadata(item.sourceMetadata, { knowledgeStatus: 'outdated' }) as Prisma.InputJsonValue, verified: false, verifiedAt: null, frozen: false } }) })
}
