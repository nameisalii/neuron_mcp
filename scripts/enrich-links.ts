import { prisma } from '@/lib/db'
import { runLinkEnrichment } from '@/lib/enrich/job'
import { MAX_CRAWLS_PER_RUN } from '@/lib/enrich/constants'

function limitFromArgs(): number {
  const index = process.argv.indexOf('--limit')
  const parsed = index >= 0 ? Number.parseInt(process.argv[index + 1] ?? '', 10) : MAX_CRAWLS_PER_RUN
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_CRAWLS_PER_RUN) : MAX_CRAWLS_PER_RUN
}

async function main() {
  const summary = await runLinkEnrichment({ maxCrawls: limitFromArgs(), force: false })
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch(() => {
    console.error('Link enrichment failed. Enable safe debug logging for domain-level diagnostics.')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
