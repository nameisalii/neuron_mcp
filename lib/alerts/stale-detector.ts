import { prisma } from '@/lib/db'

const DEFAULT_STALE_DAYS = 30

export async function detectStaleChunks(workspaceId: string): Promise<number> {
  const pref = await prisma.userPreference.findFirst({
    where: { workspaceId },
    select: { staleThresholdDays: true },
    orderBy: { createdAt: 'asc' },
  })
  const thresholdDays = pref?.staleThresholdDays ?? DEFAULT_STALE_DAYS
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000)

  const oldChunks = await prisma.notionChunk.findMany({
    where: { workspaceId, updatedAt: { lt: cutoff } },
    include: { page: { select: { id: true, title: true } } },
  })

  const labeledOldChunks = oldChunks.filter((c) => {
    const labels = c.labels as string[]
    return Array.isArray(labels) && labels.length > 0
  })

  // Group by page
  const byPage = new Map<string, { pageTitle: string; chunkIds: string[] }>()
  for (const chunk of labeledOldChunks) {
    const entry = byPage.get(chunk.notionPageId) ?? { pageTitle: chunk.page.title, chunkIds: [] }
    entry.chunkIds.push(chunk.id)
    byPage.set(chunk.notionPageId, entry)
  }

  let created = 0
  for (const [, { pageTitle, chunkIds }] of byPage) {
    // Skip if unresolved stale alert already exists for any of these chunks
    const existing = await prisma.alert.findFirst({
      where: {
        workspaceId,
        type: 'stale',
        status: { not: 'resolved' },
        sourceChunkIds: { array_contains: [chunkIds[0]] } as never,
      },
    })
    if (existing) continue

    await prisma.alert.create({
      data: {
        workspaceId,
        type: 'stale',
        title: `Stale knowledge in "${pageTitle}"`,
        description: `${chunkIds.length} labeled chunk${chunkIds.length === 1 ? '' : 's'} have not been updated in over ${thresholdDays} days.`,
        sourceChunkIds: chunkIds,
      },
    })
    created++
  }

  return created
}
