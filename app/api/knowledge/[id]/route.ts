import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { knowledgeRequestContext } from '@/lib/knowledge/api'
import { updateKnowledgeSchema } from '@/lib/knowledge/validation'
import { getKnowledgeSourceUrl, mergeKnowledgeMetadata, normalizeKnowledgeItem } from '@/lib/knowledge/display'

async function findItem(id: string, workspaceId: string) {
  return prisma.knowledgeItem.findFirst({ where: { id, workspaceId } })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await knowledgeRequestContext()
  if (context.response) return context.response
  const item = await findItem((await params).id, context.workspaceId)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const sourceUrl = getKnowledgeSourceUrl(item)
  const [tasks, decisions, documents] = await Promise.all([
    prisma.task.findMany({ where: { workspaceId: context.workspaceId, extractedFromKnowledgeItemId: item.id, status: { not: 'archived' } }, select: { id: true, title: true, status: true } }),
    prisma.decision.findMany({ where: { workspaceId: context.workspaceId, OR: [{ source: item.source }, ...(sourceUrl ? [{ sourceUrl }] : [])] }, take: 10, select: { id: true, title: true, decision: true, source: true } }),
    prisma.documentAttachment.findMany({ where: { workspaceId: context.workspaceId, OR: [...(item.sourceExternalId ? [{ sourceExternalId: item.sourceExternalId }] : []), ...(sourceUrl ? [{ sourceUrl }] : [])] }, take: 10, select: { id: true, fileName: true, documentType: true, storageUrl: true } }),
  ])
  return NextResponse.json({ item: normalizeKnowledgeItem(item), related: { tasks, decisions, documents } })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await knowledgeRequestContext()
  if (context.response) return context.response
  const parsed = updateKnowledgeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid knowledge update', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  const item = await findItem((await params).id, context.workspaceId)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const nextStatus = parsed.data.status
  const metadata = mergeKnowledgeMetadata(item.sourceMetadata, {
    ...(parsed.data.tags ? { tags: parsed.data.tags } : {}),
    ...(nextStatus ? { knowledgeStatus: nextStatus === 'verified' ? 'unverified' : nextStatus } : {}),
  })
  const updated = await prisma.knowledgeItem.update({ where: { id: item.id }, data: {
    ...(parsed.data.title !== undefined ? { label: parsed.data.title } : {}),
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
    ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
    sourceMetadata: metadata as Prisma.InputJsonValue,
    ...(nextStatus ? {
      verified: nextStatus === 'verified', verifiedAt: nextStatus === 'verified' ? new Date() : null,
      frozen: nextStatus === 'verified',
      conflictNote: nextStatus === 'conflicting' ? (item.conflictNote || 'Marked as conflicting') : null,
    } : {}),
  } })
  return NextResponse.json({ item: normalizeKnowledgeItem(updated) })
}
