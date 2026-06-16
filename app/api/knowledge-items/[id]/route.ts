import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { normalizeKnowledgeCategory } from '@/lib/knowledge/categories'

const PatchSchema = z.object({
  type: z.string().optional(),
  resetToAiSuggestion: z.boolean().optional(),
}).refine((data) => data.type || data.resetToAiSuggestion, {
  message: 'type or resetToAiSuggestion is required',
})

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { workspace: { select: { id: true } } },
    })
    const workspaceId = user?.workspace?.id
    if (!workspaceId) return NextResponse.json({ error: 'No workspace found' }, { status: 404 })

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    })
    if (!member || member.status !== 'active' || !ALLOWED_ROLES.has(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const item = await prisma.knowledgeItem.findFirst({
      where: { id: params.id, workspaceId },
      select: { id: true, category: true, aiSuggestedCategory: true },
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const nextCategory = parsed.data.resetToAiSuggestion
      ? item.aiSuggestedCategory
      : normalizeKnowledgeCategory(parsed.data.type)

    if (!nextCategory) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const updated = await prisma.knowledgeItem.update({
      where: { id: item.id },
      data: parsed.data.resetToAiSuggestion
        ? {
            category: nextCategory,
            typeOverriddenByUser: false,
            typeOverriddenAt: null,
            typeOverriddenByUserId: null,
          }
        : {
            category: nextCategory,
            aiSuggestedCategory: item.aiSuggestedCategory ?? item.category,
            typeOverriddenByUser: true,
            typeOverriddenAt: new Date(),
            typeOverriddenByUserId: userId,
          },
      select: {
        id: true,
        category: true,
        aiSuggestedCategory: true,
        typeOverriddenByUser: true,
        typeOverriddenAt: true,
        typeOverriddenByUserId: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[knowledge-items/patch]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
