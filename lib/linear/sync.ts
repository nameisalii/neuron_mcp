import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import { decrypt } from '@/lib/crypto'
import { escapeXml } from '@/lib/utils'

const LINEAR_API = 'https://api.linear.app/graphql'
const PAGE_SIZE = 250
const MAX_PAGES = 4

const ISSUES_QUERY = `
  query Issues($after: String, $updatedAfter: DateTimeOrDuration) {
    issues(first: ${PAGE_SIZE}, after: $after, filter: { updatedAt: { gt: $updatedAfter } }) {
      nodes {
        id
        title
        description
        url
        state { name }
        assignee { name }
        team { name }
        createdAt
        updatedAt
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

interface LinearIssue {
  id: string
  title: string
  description: string | null
  url: string
  state: { name: string } | null
  assignee: { name: string } | null
  team: { name: string } | null
  createdAt: string
  updatedAt: string
}

export interface SyncInput {
  id: string
  workspaceId: string
  accessToken: string
  lastSyncAt: Date | null
  metadata: Record<string, unknown> | null
}

export interface LinearSyncResult {
  synced: number
  extracted: number
}

async function fetchPage(token: string, after: string | null, updatedAfter: string | null) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({
      query: ISSUES_QUERY,
      variables: { after, updatedAfter },
    }),
  })
  if (!res.ok) throw new Error(`Linear API error: ${res.status}`)
  const json = await res.json()
  return json.data.issues as {
    nodes: LinearIssue[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}

function buildContent(issue: LinearIssue): string {
  const parts = [
    `[Linear] ${escapeXml(issue.title)}`,
    issue.state ? `Status: ${escapeXml(issue.state.name)}` : null,
    issue.team ? `Team: ${escapeXml(issue.team.name)}` : null,
    issue.assignee ? `Assignee: ${escapeXml(issue.assignee.name)}` : null,
    issue.description ? escapeXml(issue.description.slice(0, 1000)) : null,
  ]
  return parts.filter(Boolean).join('\n')
}

function computeContentHash(content: string): string {
  return content.slice(0, 100).toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function syncLinearIssues(integration: SyncInput): Promise<LinearSyncResult> {
  const rawToken = decrypt(integration.accessToken)
  const cursor = (integration.metadata?.backfillCursor as string | null) ?? null
  const updatedAfter = integration.lastSyncAt ? integration.lastSyncAt.toISOString() : null

  let synced = 0
  let extracted = 0
  let after = cursor
  let newCursor: string | null = null
  let pages = 0

  while (pages < MAX_PAGES) {
    const page = await fetchPage(rawToken, after, updatedAfter)
    pages++

    for (const issue of page.nodes) {
      if (!issue.description?.trim()) continue

      const content = buildContent(issue)
      const contentHash = computeContentHash(content)

      const exists = await prisma.knowledgeItem.findUnique({
        where: { workspaceId_contentHash: { workspaceId: integration.workspaceId, contentHash } },
        select: { id: true },
      })
      if (exists) { synced++; continue }

      const embedding = await generateEmbedding(content)

      let dbItem: { id: string }
      try {
        dbItem = await prisma.knowledgeItem.create({
          data: {
            workspaceId: integration.workspaceId,
            content,
            contentHash,
            category: 'fact',
            source: 'linear',
            sourceUrl: issue.url,
            owner: issue.assignee?.name ?? null,
            confidence: 0.85,
            frozen: false,
            sourceCreatedAt: new Date(issue.createdAt),
          },
          select: { id: true },
        })
      } catch (err) {
        console.error('[linear/sync] DB write failed, skipping', err)
        continue
      }

      try {
        await upsertEmbedding(dbItem.id, embedding, {
          workspaceId: integration.workspaceId,
          category: 'fact',
          source: 'linear',
        })
        await prisma.knowledgeItem
          .update({ where: { id: dbItem.id }, data: { embeddingId: dbItem.id } })
          .catch(() => null)
      } catch (err) {
        console.error('[linear/sync] Pinecone upsert failed, rolling back', err)
        await prisma.knowledgeItem.delete({ where: { id: dbItem.id } }).catch(() => null)
        continue
      }

      synced++
      extracted++
    }

    if (!page.pageInfo.hasNextPage) {
      newCursor = null
      break
    }

    newCursor = page.pageInfo.endCursor
    after = newCursor
  }

  const metadataUpdate =
    newCursor !== null
      ? { ...(integration.metadata ?? {}), backfillCursor: newCursor }
      : { ...(integration.metadata ?? {}), backfillCursor: null }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date(), metadata: metadataUpdate },
  })

  return { synced, extracted }
}
