import { PrismaClient } from '@prisma/client'
import { tsImport } from 'tsx/esm/api'

const { rewriteQuery } = await tsImport('../lib/query/rewrite.ts', import.meta.url)
const prisma = new PrismaClient()
const originalQuery = 'Do I have an interview with trade desk?'
const rewrite = rewriteQuery({ currentQuery: originalQuery })
const terms = rewrite.entitySearchTerms

try {
  const connection = await prisma.integration.findFirst({
    where: { type: 'gmail' },
    orderBy: { lastSyncAt: 'desc' },
    select: { workspaceId: true },
  })
  if (!connection) {
    console.log(JSON.stringify({
      originalQuery,
      interpretedQuery: rewrite.rewrittenQuery,
      detectedEntities: rewrite.detectedEntities,
      detectedIntent: rewrite.detectedIntent,
      sourceCounts: { gmail: 0, knowledge: 0, tasks: 0, decisions: 0 },
      topSources: [],
      note: 'No Gmail connection is available in the local database.',
    }, null, 2))
  } else {
    const contains = (term) => ({ contains: term, mode: 'insensitive' })
    const [gmail, knowledge, tasks, decisions] = await Promise.all([
      prisma.emailChunk.findMany({
        where: { workspaceId: connection.workspaceId, OR: terms.flatMap((term) => [{ content: contains(term) }, { thread: { subject: contains(term) } }]) },
        select: { thread: { select: { subject: true, lastMessageAt: true } } }, take: 5,
      }),
      prisma.knowledgeItem.findMany({
        where: { workspaceId: connection.workspaceId, OR: terms.flatMap((term) => [{ content: contains(term) }, { summary: contains(term) }, { reason: contains(term) }, { title: contains(term) }]) },
        select: { title: true, label: true, source: true, sourceCreatedAt: true }, take: 5,
      }),
      prisma.task.findMany({
        where: { workspaceId: connection.workspaceId, OR: terms.flatMap((term) => [{ title: contains(term) }, { description: contains(term) }, { sourceSnippet: contains(term) }]) },
        select: { title: true, dueAt: true, sourceType: true }, take: 5,
      }),
      prisma.decision.findMany({
        where: { workspaceId: connection.workspaceId, OR: terms.flatMap((term) => [{ title: contains(term) }, { decision: contains(term) }, { reason: contains(term) }]) },
        select: { title: true, madeAt: true, source: true }, take: 5,
      }),
    ])
    console.log(JSON.stringify({
      originalQuery,
      interpretedQuery: rewrite.rewrittenQuery,
      detectedEntities: rewrite.detectedEntities,
      detectedIntent: rewrite.detectedIntent,
      sourceCounts: { gmail: gmail.length, knowledge: knowledge.length, tasks: tasks.length, decisions: decisions.length },
      topSources: [
        ...gmail.map((row) => ({ sourceType: 'gmail', title: row.thread.subject, date: row.thread.lastMessageAt, score: null })),
        ...knowledge.map((row) => ({ sourceType: row.source, title: row.title ?? row.label ?? 'Knowledge item', date: row.sourceCreatedAt, score: null })),
        ...tasks.map((row) => ({ sourceType: row.sourceType ?? 'task', title: row.title, date: row.dueAt, score: null })),
        ...decisions.map((row) => ({ sourceType: row.source || 'decision', title: row.title, date: row.madeAt, score: null })),
      ].slice(0, 10),
      privateContentPrinted: false,
    }, null, 2))
  }
} finally {
  await prisma.$disconnect()
}
