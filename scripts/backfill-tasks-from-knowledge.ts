import { prisma } from '../lib/db'
import { extractAndCreateSuggestedTaskFromKnowledgeItem } from '../lib/tasks/service'

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const supportedSources = ['telegram', 'slack', 'datatruck', 'manual']
const requestedSource = argument('source')
const workspaceId = argument('workspace')
const requestedLimit = Number(argument('limit') ?? 100)
const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500) : 100

if (requestedSource && !supportedSources.includes(requestedSource)) {
  throw new Error(`Unsupported source. Choose one of: ${supportedSources.join(', ')}`)
}

async function main() {
  const items = await prisma.knowledgeItem.findMany({
    where: {
      source: requestedSource ?? { in: supportedSources },
      ...(workspaceId ? { workspaceId } : {}),
      extractedTasks: { none: {} },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, workspaceId: true, content: true, source: true, sourceExternalId: true,
      sourceUrl: true, notionPageTitle: true, sourceCreatedAt: true, sourceMetadata: true,
    },
  })

  let tasksCreated = 0
  let skipped = 0
  const skippedReasons: Record<string, number> = {}
  for (const item of items) {
    const result = await extractAndCreateSuggestedTaskFromKnowledgeItem({ knowledgeItemId: item.id, workspaceId: item.workspaceId })
    tasksCreated += result.tasks.length
    if (result.status === 'skipped') {
      skipped++
      const reason = result.reason ?? 'unknown'
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1
    }
  }
  console.log('Task backfill complete:', { checked: items.length, created: tasksCreated, skipped, skippedReasons, source: requestedSource ?? 'default sources' })
}

main().catch((error) => {
  console.error('Task backfill failed:', error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
