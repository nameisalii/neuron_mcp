import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { validateApiKey } from '@/lib/api-auth'

const CreateDecisionSchema = z.object({
  decision: z.string().min(3).max(2000),
  reason: z.string().max(1000).optional(),
  alternatives: z.string().max(500).optional(),
})

async function resolveWorkspaceId(req: Request): Promise<string | null> {
  const apiWorkspaceId = validateApiKey(req)
  if (apiWorkspaceId) return apiWorkspaceId

  const { userId } = await auth()
  if (!userId) return null

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { workspace: { select: { id: true } } },
  })
  return user?.workspace?.id ?? null
}

export async function POST(req: Request) {
  try {
    const workspaceId = await resolveWorkspaceId(req)
    if (!workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = CreateDecisionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    const { decision, reason, alternatives } = parsed.data

    const dbItem = await prisma.knowledgeItem.create({
      data: {
        workspaceId,
        content: decision,
        category: 'decision',
        aiSuggestedCategory: 'decision',
        source: 'mcp',
        reason: reason ?? null,
        alternatives: alternatives ?? null,
        confidence: 1.0,
      },
      select: { id: true },
    })

    const embedding = await generateEmbedding(decision)
    await upsertEmbedding(dbItem.id, embedding, {
      workspaceId,
      category: 'decision',
      source: 'mcp',
    })
    await prisma.knowledgeItem.update({
      where: { id: dbItem.id },
      data: { embeddingId: dbItem.id },
    })

    return NextResponse.json({ saved: true, id: dbItem.id })
  } catch (err) {
    console.error('[decisions/create]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
