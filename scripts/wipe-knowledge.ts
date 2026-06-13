import { prisma } from '@/lib/db'
import { deleteAllEmbeddings } from '@/lib/pinecone'

async function main() {
  console.log('Wiping all synced Notion knowledge...')

  // 1. Wipe Pinecone vectors (all in the default namespace)
  try {
    await deleteAllEmbeddings()
    console.log('Pinecone vectors deleted.')
  } catch (err) {
    console.warn('Pinecone deletion skipped or failed (may already be empty):', err)
  }

  // 2. Delete DB records — chunks before pages (FK constraint)
  const chunks = await prisma.notionChunk.deleteMany({})
  console.log(`Deleted ${chunks.count} NotionChunk rows.`)

  const pages = await prisma.notionPage.deleteMany({})
  console.log(`Deleted ${pages.count} NotionPage rows.`)

  // 3. Delete KnowledgeItem rows sourced from Notion
  const ki = await prisma.knowledgeItem.deleteMany({
    where: { source: { contains: 'notion', mode: 'insensitive' } },
  })
  console.log(`Deleted ${ki.count} KnowledgeItem rows (notion source).`)

  // 4. Reset lastSyncAt so the next sync is a full re-import
  const integrations = await prisma.integration.updateMany({
    where: { type: 'notion' },
    data: { lastSyncAt: null },
  })
  console.log(`Reset lastSyncAt on ${integrations.count} Notion integration(s).`)

  console.log('Done. Go to Integrations → Sync Now to re-import with corrected nesting.')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
