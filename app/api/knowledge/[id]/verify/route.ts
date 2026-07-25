import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { knowledgeRequestContext } from '@/lib/knowledge/api'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await knowledgeRequestContext(); if (context.response) return context.response
  const item = await prisma.knowledgeItem.findFirst({ where: { id: (await params).id, workspaceId: context.workspaceId }, select: { id: true } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const updated = await prisma.knowledgeItem.update({ where: { id: item.id }, data: { verified: true, verifiedAt: new Date(), frozen: true } })
  return NextResponse.json({ item: updated })
}
