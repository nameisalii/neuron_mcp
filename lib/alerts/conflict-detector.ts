import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { searchInNamespace } from '@/lib/pinecone'

function wordOverlap(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))
  if (setA.size === 0 || setB.size === 0) return 0
  let common = 0
  for (const w of setA) if (setB.has(w)) common++
  return common / Math.max(setA.size, setB.size)
}

export async function detectConflicts(workspaceId: string, chunkId: string): Promise<void> {
  const chunk = await prisma.notionChunk.findUnique({
    where: { id: chunkId },
    select: { id: true, content: true, pineconeId: true, workspaceId: true },
  })
  if (!chunk?.pineconeId || chunk.workspaceId !== workspaceId) return

  let embedding: number[]
  try {
    embedding = await generateEmbedding(chunk.content)
  } catch (err) {
    console.error('[conflict-detector] embedding failed', err)
    return
  }

  const matches = await searchInNamespace(embedding, workspaceId, 5, 0.85)
  const others = matches.filter((m) => m.id !== chunk.pineconeId)

  for (const match of others) {
    const other = await prisma.notionChunk.findFirst({
      where: { pineconeId: match.id, workspaceId },
      select: { id: true, content: true },
    })
    if (!other) continue

    // Semantically similar but textually different = conflict
    if (wordOverlap(chunk.content, other.content) >= 0.6) continue

    // Skip if conflict alert already exists for these two chunks
    const existing = await prisma.alert.findFirst({
      where: {
        workspaceId,
        type: 'conflict',
        status: { not: 'resolved' },
        AND: [
          { sourceChunkIds: { array_contains: [chunkId] } as never },
          { sourceChunkIds: { array_contains: [other.id] } as never },
        ],
      },
    })
    if (existing) continue

    await prisma.alert.create({
      data: {
        workspaceId,
        type: 'conflict',
        title: 'Conflicting knowledge detected',
        description: `Two chunks have similar meaning but different content (similarity: ${Math.round(match.score * 100)}%).`,
        sourceChunkIds: [chunkId, other.id],
      },
    })
  }
}
