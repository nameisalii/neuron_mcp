import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  const connections = await prisma.integration.findMany({
    where: { type: 'gmail' },
    select: { workspaceId: true, lastSyncAt: true, metadata: true },
  })
  const [emailThreads, emailChunks, gmailKnowledgeItems] = await Promise.all([
    prisma.emailThread.count(),
    prisma.emailChunk.count(),
    prisma.knowledgeItem.count({ where: { source: 'gmail' } }),
  ])

  console.log(JSON.stringify({
    connections: connections.length,
    emailThreads,
    emailChunks,
    gmailKnowledgeItems,
    syncs: connections.map((connection) => {
      const metadata = connection.metadata && typeof connection.metadata === 'object' && !Array.isArray(connection.metadata)
        ? connection.metadata
        : {}
      return {
        lastSyncAt: connection.lastSyncAt,
        lastSuccessfulImportAt: metadata.lastSuccessfulImportAt ?? null,
        lastSyncStatus: metadata.lastSyncStatus ?? null,
        lastSyncStats: metadata.lastSyncStats ?? null,
        backfillStatus: metadata.backfillStatus ?? null,
        hasMore: Boolean(metadata.backfillCursor),
      }
    }),
  }, null, 2))
} finally {
  await prisma.$disconnect()
}
