import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { decrypt } from '@/lib/crypto'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import { generateEmbedding } from '@/lib/openai'
import { deleteEmbeddings, upsertEmbedding } from '@/lib/pinecone'

const LINEAR_API = 'https://api.linear.app/graphql'
const PAGE_SIZE = 100
const MAX_PAGES = 4

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  url
  priority
  priorityLabel
  state { name type }
  assignee { name }
  creator { name }
  team { id name key }
  project { id name description url state }
  labels { nodes { name } }
  comments { nodes { id body createdAt updatedAt user { name } } }
  history { nodes { createdAt actor { name } fromState { name } toState { name } } }
  createdAt
  updatedAt
  completedAt
  canceledAt
  archivedAt
`

const ACCESS_QUERY = `
  query LinearAccess {
    viewer { id name }
    organization { id name }
    teams(first: 100) {
      nodes { id name key }
    }
  }
`

const TEAM_ISSUES_QUERY = `
  query TeamIssues($teamId: String!, $after: String) {
    team(id: $teamId) {
      issues(first: ${PAGE_SIZE}, after: $after, includeArchived: true) {
        nodes { id }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`

const TEAM_ISSUES_INCREMENTAL_QUERY = `
  query TeamIssuesIncremental($teamId: String!, $after: String, $updatedAfter: DateTimeOrDuration!) {
    team(id: $teamId) {
      issues(first: ${PAGE_SIZE}, after: $after, includeArchived: true, filter: { updatedAt: { gt: $updatedAfter } }) {
        nodes { id }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`

const ISSUE_QUERY = `
  query Issue($id: String!) {
    issue(id: $id) { ${ISSUE_FIELDS} }
  }
`

interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  url: string
  priority: number
  priorityLabel: string
  state: { name: string; type: string } | null
  assignee: { name: string } | null
  creator: { name: string } | null
  team: { id: string; name: string; key: string } | null
  project: { id: string; name: string; description: string | null; url: string; state: string } | null
  labels: { nodes: Array<{ name: string }> }
  comments: { nodes: Array<{ id: string; body: string; createdAt: string; updatedAt: string; user: { name: string } | null }> }
  history: { nodes: Array<{ createdAt: string; actor: { name: string } | null; fromState: { name: string } | null; toState: { name: string } | null }> }
  createdAt: string
  updatedAt: string
  completedAt: string | null
  canceledAt: string | null
  archivedAt: string | null
}

interface LinearIssueRef {
  id: string
}

interface LinearAccess {
  viewer: { id: string; name: string }
  organization: { id: string; name: string }
  teams: { nodes: Array<{ id: string; name: string; key: string }> }
}

export interface LinearTeamSyncDetail {
  id: string
  name: string
  key: string
  issuesFound: number
}

export interface SyncInput {
  id: string
  workspaceId: string
  accessToken: string
  lastSyncAt: Date | null
  metadata: Record<string, unknown> | null
}

export interface LinearSyncResult {
  success: boolean
  fetched?: number
  processed?: number
  knowledgeCreated?: number
  knowledgeUpdated?: number
  extractionErrors?: number
  embeddingErrors?: number
  databaseErrors?: number
  extractionEmbeddingErrors?: number
  synced: number
  extracted: number
  imported: number
  updated: number
  skipped: number
  deleted: number
  issuesFound: number
  teamsScanned: number
  teams: LinearTeamSyncDetail[]
  organization: { id: string; name: string }
  viewer: { id: string; name: string }
  skippedReasons: Record<string, number>
  message?: string
}

function emptyExtractionDiagnostics(): ExtractionDiagnostics {
  return {
    extractorCalled: 0,
    extractorReturnedEmpty: 0,
    extractorParseFailed: 0,
    validationFailed: 0,
    fallbackItemsCreated: 0,
    knowledgeItemCreateFailed: 0,
    embeddingUpsertFailed: 0,
    itemProcessingFailed: 0,
  }
}

function addExtractionDiagnostics(target: ExtractionDiagnostics, source: ExtractionDiagnostics) {
  for (const key of Object.keys(target) as Array<keyof ExtractionDiagnostics>) {
    target[key] += source[key] ?? 0
  }
}

function extractionErrorCount(diagnostics: ExtractionDiagnostics) {
  return diagnostics.extractorParseFailed
    + diagnostics.validationFailed
    + diagnostics.itemProcessingFailed
}

async function linearRequest<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(`Linear GraphQL error: ${json.errors[0]?.message ?? 'Unknown error'}`)
  }
  if (!res.ok) throw new Error(`Linear API error: ${res.status}`)
  return json.data as T
}

async function fetchAccess(token: string): Promise<LinearAccess> {
  return linearRequest<LinearAccess>(token, ACCESS_QUERY, {})
}

async function fetchTeamPage(token: string, teamId: string, after: string | null, updatedAfter: string | null) {
  const query = updatedAfter ? TEAM_ISSUES_INCREMENTAL_QUERY : TEAM_ISSUES_QUERY
  const data = await linearRequest<{
    team?: { issues?: { nodes: LinearIssueRef[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }
  }>(token, query, { teamId, after, ...(updatedAfter ? { updatedAfter } : {}) })
  return data.team?.issues ?? { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
}

export async function fetchLinearIssue(token: string, issueId: string): Promise<LinearIssue | null> {
  const data = await linearRequest<{ issue?: LinearIssue | null }>(token, ISSUE_QUERY, { id: issueId })
  return data.issue ?? null
}

function buildContent(issue: LinearIssue): string {
  const comments = issue.comments?.nodes ?? []
  const history = issue.history?.nodes ?? []
  const labels = issue.labels?.nodes?.map((label) => label.name) ?? []
  const parts = [
    `Linear issue ${issue.identifier}: ${issue.title}`,
    issue.description?.trim() ? `Description:\n${issue.description.trim()}` : null,
    issue.state ? `Status: ${issue.state.name} (${issue.state.type})` : null,
    issue.project ? `Project: ${issue.project.name} (${issue.project.state})${issue.project.description ? `\nProject description: ${issue.project.description}` : ''}` : null,
    issue.team ? `Team: ${issue.team.name} (${issue.team.key})` : null,
    issue.assignee ? `Assignee: ${issue.assignee.name}` : null,
    issue.creator ? `Creator: ${issue.creator.name}` : null,
    issue.priorityLabel ? `Priority: ${issue.priorityLabel} (${issue.priority})` : null,
    labels.length ? `Labels: ${labels.join(', ')}` : null,
    `Created: ${issue.createdAt}`,
    `Updated: ${issue.updatedAt}`,
    issue.completedAt ? `Completed: ${issue.completedAt}` : null,
    issue.canceledAt ? `Canceled: ${issue.canceledAt}` : null,
    comments.length
      ? `Comments:\n${comments.map((comment) => `- ${comment.user?.name ?? 'Unknown'} (${comment.createdAt}): ${comment.body}`).join('\n')}`
      : null,
    history.length
      ? `Status history:\n${history.map((event) => `- ${event.createdAt}: ${event.actor?.name ?? 'Unknown'} changed ${event.fromState?.name ?? 'unknown'} to ${event.toState?.name ?? 'unknown'}`).join('\n')}`
      : null,
    `Linear URL: ${issue.url}`,
  ]
  return parts.filter(Boolean).join('\n')
}

function contentHash(content: string): string {
  return content.slice(0, 100).toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function deleteLinearIssue(workspaceId: string, issueId: string, sourceUrl?: string): Promise<number> {
  const existing = await prisma.knowledgeItem.findMany({
    where: {
      workspaceId,
      source: 'linear',
      OR: [
        { sourceExternalId: issueId },
        ...(sourceUrl ? [{ sourceUrl }] : []),
      ],
    },
    select: { id: true, embeddingId: true },
  })
  await deleteEmbeddings(existing.map((item) => item.embeddingId ?? item.id))
  const result = await prisma.knowledgeItem.deleteMany({
    where: { id: { in: existing.map((item) => item.id) }, workspaceId },
  })
  return result.count
}

export async function syncLinearIssue(
  workspaceId: string,
  issue: LinearIssue,
): Promise<{
  extracted: number
  imported: number
  updated: number
  skipped: number
  deleted: number
  diagnostics: ExtractionDiagnostics
}> {
  const diagnostics = emptyExtractionDiagnostics()
  const existingCount = await prisma.knowledgeItem.count({
    where: { workspaceId, source: 'linear', OR: [{ sourceExternalId: issue.id }, { sourceUrl: issue.url }] },
  })

  if (issue.archivedAt) {
    const deleted = await deleteLinearIssue(workspaceId, issue.id, issue.url)
    return { extracted: 0, imported: 0, updated: 0, skipped: deleted ? 0 : 1, deleted, diagnostics }
  }

  await deleteLinearIssue(workspaceId, issue.id, issue.url)
  const document = buildContent(issue)
  const category = issue.completedAt || issue.canceledAt ? 'status_update' : 'fact'
  const dbItem = await prisma.knowledgeItem.create({
    data: {
      workspaceId,
      content: document,
      contentHash: contentHash(document),
      category,
      source: 'linear',
      sourceUrl: issue.url,
      sourceExternalId: issue.id,
      owner: issue.assignee?.name ?? null,
      confidence: 0.9,
      sourceCreatedAt: new Date(issue.createdAt),
    },
    select: { id: true },
  })
  try {
    const embedding = await generateEmbedding(document)
    await upsertEmbedding(dbItem.id, embedding, {
      workspaceId,
      category,
      source: 'linear',
    })
    await prisma.knowledgeItem.update({ where: { id: dbItem.id }, data: { embeddingId: dbItem.id } })
  } catch (err) {
    console.error('[linear/sync] embedding failed; keeping DB item without vector', err)
    diagnostics.embeddingUpsertFailed++
  }

  const extraction = await extractKnowledgeDetailed(
    [{ text: document, user: issue.creator?.name ?? 'Linear', channel: issue.team?.name ?? 'Linear', ts: String(new Date(issue.createdAt).getTime() / 1000), permalink: issue.url }],
    workspaceId,
    'linear',
    issue.url,
    issue.id,
  )
  addExtractionDiagnostics(diagnostics, extraction.diagnostics)

  return {
    extracted: extraction.items.length + 1,
    imported: existingCount === 0 ? 1 : 0,
    updated: existingCount > 0 ? 1 : 0,
    skipped: 0,
    deleted: 0,
    diagnostics,
  }
}

export async function syncLinearIssueById(integration: SyncInput, issueId: string) {
  const rawToken = decrypt(integration.accessToken)
  const issue = await fetchLinearIssue(rawToken, issueId)
  if (!issue) {
    const deleted = await deleteLinearIssue(integration.workspaceId, issueId)
    return { extracted: 0, imported: 0, updated: 0, skipped: deleted ? 0 : 1, deleted }
  }
  return syncLinearIssue(integration.workspaceId, issue)
}

export async function syncLinearIssues(integration: SyncInput): Promise<LinearSyncResult> {
  const rawToken = decrypt(integration.accessToken)
  const access = await fetchAccess(rawToken)
  const existingLinearItems = await prisma.knowledgeItem.count({
    where: { workspaceId: integration.workspaceId, source: 'linear' },
  })
  // Recover from previous empty syncs that advanced lastSyncAt despite importing nothing.
  const updatedAfter = existingLinearItems > 0 ? integration.lastSyncAt?.toISOString() ?? null : null
  const result: LinearSyncResult = {
    success: true,
    fetched: 0,
    processed: 0,
    knowledgeCreated: 0,
    knowledgeUpdated: 0,
    extractionErrors: 0,
    embeddingErrors: 0,
    databaseErrors: 0,
    extractionEmbeddingErrors: 0,
    synced: 0,
    extracted: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    issuesFound: 0,
    teamsScanned: access.teams.nodes.length,
    teams: [],
    organization: access.organization,
    viewer: access.viewer,
    skippedReasons: {},
  }

  for (const team of access.teams.nodes) {
    let after: string | null = null
    let pages = 0
    let teamIssuesFound = 0

    while (pages < MAX_PAGES) {
      const page = await fetchTeamPage(rawToken, team.id, after, updatedAfter)
      pages++
      teamIssuesFound += page.nodes.length
      result.issuesFound += page.nodes.length
      result.fetched! += page.nodes.length

      for (const issueRef of page.nodes) {
        try {
          const issue = await fetchLinearIssue(rawToken, issueRef.id)
          if (!issue) {
            result.skipped++
            result.skippedReasons.issue_not_accessible = (result.skippedReasons.issue_not_accessible ?? 0) + 1
            continue
          }
          const itemResult = await syncLinearIssue(integration.workspaceId, issue)
          result.synced++
          result.processed!++
          result.extracted += itemResult.extracted
          result.imported += itemResult.imported
          result.knowledgeCreated! += itemResult.imported
          result.updated += itemResult.updated
          result.knowledgeUpdated! += itemResult.updated
          result.skipped += itemResult.skipped
          result.deleted += itemResult.deleted
          result.extractionErrors! += extractionErrorCount(itemResult.diagnostics)
          result.embeddingErrors! += itemResult.diagnostics.embeddingUpsertFailed
          result.databaseErrors! += itemResult.diagnostics.knowledgeItemCreateFailed
          result.extractionEmbeddingErrors! += extractionErrorCount(itemResult.diagnostics)
            + itemResult.diagnostics.embeddingUpsertFailed
            + itemResult.diagnostics.knowledgeItemCreateFailed
          if (itemResult.skipped > 0) {
            const reason = issue.archivedAt ? 'archived_issue_not_previously_imported' : 'unchanged_or_duplicate'
            result.skippedReasons[reason] = (result.skippedReasons[reason] ?? 0) + itemResult.skipped
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Unknown issue processing error'
          console.error(`[linear/sync] issue ${issueRef.id} skipped:`, err)
          result.databaseErrors!++
          result.extractionEmbeddingErrors!++
          result.skipped++
          result.skippedReasons[reason] = (result.skippedReasons[reason] ?? 0) + 1
        }
      }

      if (!page.pageInfo.hasNextPage) break
      after = page.pageInfo.endCursor
    }
    result.teams.push({ ...team, issuesFound: teamIssuesFound })
  }

  if (result.issuesFound === 0) {
    result.message = 'Connected to Linear, but no issues were returned. Check team access/scopes.'
  }

  console.info('[linear/sync] summary', {
    workspaceId: integration.workspaceId,
    integration: 'linear',
    integrationId: integration.id,
    fetched: result.fetched,
    processed: result.processed,
    textItems: result.synced,
    chunks: result.processed,
    knowledgeItemsCreated: result.knowledgeCreated,
    knowledgeItemsUpdated: result.knowledgeUpdated,
    skipped: result.skipped,
    skippedReasons: result.skippedReasons,
    extractionErrors: result.extractionErrors,
    embeddingErrors: result.embeddingErrors,
    databaseErrors: result.databaseErrors,
    teamsScanned: result.teamsScanned,
  })

  if (result.issuesFound > 0 && result.synced === 0 && result.extractionEmbeddingErrors! > 0) {
    throw new Error('Linear sync fetched issues, but ingestion failed for every item.')
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      lastSyncAt: new Date(),
      teamId: access.organization.id,
      teamName: access.organization.name,
      metadata: {
        ...(integration.metadata ?? {}),
        status: 'active',
        lastSyncDebug: {
          organization: access.organization,
          viewer: access.viewer,
          teams: result.teams,
          issuesFound: result.issuesFound,
          skippedReasons: result.skippedReasons,
        },
      } as unknown as Prisma.InputJsonValue,
    },
  })
  return result
}
