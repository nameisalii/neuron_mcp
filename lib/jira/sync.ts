import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import type { SlackMessage } from '@/types'
import {
  JiraApiError,
  decodeJiraToken,
  encodeJiraToken,
  getJiraIssueComments,
  refreshJiraToken,
  searchJiraIssues,
  type JiraAccessibleResource,
  type JiraComment,
  type JiraIssue,
} from './api'
import { adfToPlainText, normalizeJiraText, shouldSkipJiraText } from './text'

const MAX_ISSUES = 50
const PAGE_SIZE = 25
const COMMENTS_PER_ISSUE = 5
const DESCRIPTION_EXCERPT_CHARS = 2000
const COMMENT_EXCERPT_CHARS = 1200

export interface JiraSyncResult {
  success: boolean
  fetched: number
  processed: number
  knowledgeCreated: number
  knowledgeUpdated: number
  skipped: number
  skippedReasons: Record<string, number>
  extractionErrors: number
  embeddingErrors: number
  databaseErrors: number
  projectsScanned: number
  issuesFetched: number
  commentsFetched: number
  reconnectNeeded?: boolean
  permissionIssue?: boolean
  message?: string
}

interface JiraSyncParams {
  workspaceId: string
  integrationId: string
  encryptedToken: string
  metadata: unknown
  lastSyncAt: Date | null
  syncedBy: string
  syncedByName: string
}

interface JiraMetadata {
  cloudId?: string
  siteUrl?: string
  siteName?: string
  resources?: JiraAccessibleResource[]
}

function metadataObject(value: unknown): JiraMetadata {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JiraMetadata : {}
}

function increment(target: Record<string, number>, reason: string): void {
  target[reason] = (target[reason] ?? 0) + 1
}

function extractionErrorCount(diagnostics: ExtractionDiagnostics): number {
  return diagnostics.extractorParseFailed + diagnostics.validationFailed + diagnostics.itemProcessingFailed
}

function emptyResult(extra: Partial<JiraSyncResult> = {}): JiraSyncResult {
  return {
    success: true,
    fetched: 0,
    processed: 0,
    knowledgeCreated: 0,
    knowledgeUpdated: 0,
    skipped: 0,
    skippedReasons: {},
    extractionErrors: 0,
    embeddingErrors: 0,
    databaseErrors: 0,
    projectsScanned: 0,
    issuesFetched: 0,
    commentsFetched: 0,
    ...extra,
  }
}

function isPermissionError(error: unknown): boolean {
  return error instanceof JiraApiError && (error.status === 401 || error.status === 403)
}

function contentHash(sourceExternalId: string): string {
  return `jira:${createHash('sha256').update(sourceExternalId).digest('hex')}`
}

function issueUrl(siteUrl: string | undefined, issueKey: string): string | null {
  if (!siteUrl) return null
  return `${siteUrl.replace(/\/$/, '')}/browse/${encodeURIComponent(issueKey)}`
}

function issueSnippet(issue: JiraIssue, usefulComments: string[]): string {
  const fields = issue.fields
  const description = adfToPlainText(fields.description).slice(0, DESCRIPTION_EXCERPT_CHARS)

  return normalizeJiraText([
    `[${issue.key}] ${fields.summary ?? 'Untitled Jira issue'}`,
    [
      fields.issuetype?.name ? `Type: ${fields.issuetype.name}` : null,
      fields.status?.name ? `Status: ${fields.status.name}` : null,
      fields.priority?.name ? `Priority: ${fields.priority.name}` : null,
      fields.assignee?.displayName ? `Assignee: ${fields.assignee.displayName}` : null,
    ].filter(Boolean).join(' · '),
    description ? `Description: ${description}` : null,
    usefulComments.length ? `Recent comments: ${usefulComments.join(' | ')}` : null,
  ].filter(Boolean).join('\n'))
}

function asExtractionMessage(issue: JiraIssue, content: string, sourceUrl: string | null): SlackMessage {
  return {
    text: content,
    user: issue.fields.assignee?.displayName || issue.fields.reporter?.displayName || 'Jira user',
    channel: issue.fields.project?.key || 'Jira',
    ts: issue.fields.updated ? String(new Date(issue.fields.updated).getTime() / 1000) : String(Date.now() / 1000),
    permalink: sourceUrl ?? undefined,
  }
}

function jqlForSync(lastSyncAt: Date | null): string {
  if (!lastSyncAt) return 'updated >= -30d ORDER BY updated DESC'
  const iso = lastSyncAt.toISOString().slice(0, 16).replace('T', ' ')
  return `updated >= "${iso}" ORDER BY updated DESC`
}

export async function syncJira(params: JiraSyncParams): Promise<JiraSyncResult> {
  const metadata = metadataObject(params.metadata)
  const cloudId = metadata.cloudId
  if (!cloudId) {
    return emptyResult({
      success: false,
      reconnectNeeded: true,
      message: 'Jira needs to be reconnected because no Jira Cloud site is selected.',
    })
  }

  const token = decodeJiraToken(params.encryptedToken)
  if (!token) {
    return emptyResult({
      success: false,
      reconnectNeeded: true,
      message: 'Jira needs to be reconnected.',
    })
  }

  let activeToken = token
  try {
    activeToken = await refreshJiraToken(token)
    if (activeToken.accessToken !== token.accessToken || activeToken.refreshToken !== token.refreshToken) {
      await prisma.integration.update({
        where: { id: params.integrationId },
        data: { accessToken: encodeJiraToken(activeToken) },
      })
    }
  } catch {
    return emptyResult({
      success: false,
      reconnectNeeded: true,
      message: 'Jira token refresh failed. Reconnect Jira.',
    })
  }

  const result = emptyResult({ projectsScanned: metadata.resources?.length ?? 1 })
  const jql = jqlForSync(params.lastSyncAt)
  const issues: JiraIssue[] = []
  try {
    for (let startAt = 0; startAt < MAX_ISSUES; startAt += PAGE_SIZE) {
      const page = await searchJiraIssues({
        accessToken: activeToken.accessToken,
        cloudId,
        jql,
        startAt,
        maxResults: Math.min(PAGE_SIZE, MAX_ISSUES - startAt),
      })
      const batch = page.issues ?? []
      issues.push(...batch)
      if (batch.length < PAGE_SIZE || issues.length >= MAX_ISSUES) break
    }
  } catch (error) {
    if (isPermissionError(error)) {
      return emptyResult({
        success: false,
        permissionIssue: true,
        projectsScanned: metadata.resources?.length ?? 1,
        message: 'Jira returned a permission error. Reconnect Jira or ask an Atlassian admin to approve the requested scopes.',
      })
    }
    throw error
  }

  result.fetched = issues.length
  result.issuesFetched = issues.length

  for (const issue of issues) {
    let comments = issue.fields.comment?.comments ?? []
    try {
      const commentsResponse = await getJiraIssueComments({
        accessToken: activeToken.accessToken,
        cloudId,
        issueIdOrKey: issue.key,
        maxResults: COMMENTS_PER_ISSUE,
      })
      comments = commentsResponse.comments ?? comments
    } catch (error) {
      if (isPermissionError(error)) {
        increment(result.skippedReasons, 'comments_permission_denied')
      } else {
        increment(result.skippedReasons, 'comments_fetch_failed')
      }
    }
    result.commentsFetched += comments.length

    const usefulComments: string[] = []
    for (const comment of comments) {
      const commentText = normalizeJiraText(adfToPlainText(comment.body).slice(0, COMMENT_EXCERPT_CHARS))
      const commentQuality = shouldSkipJiraText(commentText)
      if (commentQuality.skip) {
        increment(result.skippedReasons, commentQuality.reason ?? 'too_short')
        result.skipped++
        continue
      }
      usefulComments.push(commentText)
    }

    const content = issueSnippet(issue, usefulComments.slice(0, COMMENTS_PER_ISSUE))
    const quality = shouldSkipJiraText(content)
    if (quality.skip) {
      increment(result.skippedReasons, quality.reason ?? 'too_short')
      result.skipped++
      continue
    }

    const sourceExternalId = issue.key || issue.id
    const existing = await prisma.knowledgeItem.findFirst({
      where: { workspaceId: params.workspaceId, source: 'jira', sourceExternalId },
      select: { id: true },
    })
    if (existing) {
      increment(result.skippedReasons, 'duplicate')
      result.skipped++
      continue
    }

    const sourceUrl = issueUrl(metadata.siteUrl, issue.key)
    let dbItem: { id: string }
    try {
      dbItem = await prisma.knowledgeItem.create({
        data: {
          workspaceId: params.workspaceId,
          content,
          contentHash: contentHash(sourceExternalId),
          category: 'fact',
          aiSuggestedCategory: 'fact',
          source: 'jira',
          sourceExternalId,
          sourceUrl,
          sourceMetadata: {
            cloudId,
            issueId: issue.id,
            issueKey: issue.key,
            projectKey: issue.fields.project?.key ?? null,
            issueType: issue.fields.issuetype?.name ?? null,
            status: issue.fields.status?.name ?? null,
            priority: issue.fields.priority?.name ?? null,
            updated: issue.fields.updated ?? null,
            commentCount: comments.length,
          },
          owner: issue.fields.assignee?.displayName ?? null,
          confidence: 0.6,
          visibility: 'team',
          sourceCreatedAt: issue.fields.created ? new Date(issue.fields.created) : null,
        },
        select: { id: true },
      })
      result.knowledgeCreated++
      result.processed++
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        increment(result.skippedReasons, 'duplicate')
      } else {
        result.databaseErrors++
        increment(result.skippedReasons, 'database_error')
      }
      result.skipped++
      continue
    }

    try {
      const embedding = await generateEmbedding(content)
      await upsertEmbedding(dbItem.id, embedding, {
        workspaceId: params.workspaceId,
        category: 'fact',
        source: 'jira',
      })
      await prisma.knowledgeItem.update({ where: { id: dbItem.id }, data: { embeddingId: dbItem.id } })
      result.knowledgeUpdated++
    } catch {
      result.embeddingErrors++
    }

    try {
      const extraction = await extractKnowledgeDetailed(
        [asExtractionMessage(issue, content, sourceUrl)],
        params.workspaceId,
        'jira',
        sourceUrl ?? undefined,
        sourceExternalId,
      )
      result.knowledgeCreated += extraction.items.length
      result.extractionErrors += extractionErrorCount(extraction.diagnostics)
      result.embeddingErrors += extraction.diagnostics.embeddingUpsertFailed
      result.databaseErrors += extraction.diagnostics.knowledgeItemCreateFailed
    } catch {
      result.extractionErrors++
    }
  }

  await prisma.integration.update({
    where: { id: params.integrationId },
    data: { lastSyncAt: new Date() },
  })

  await trackEvent(params.workspaceId, params.syncedBy, params.syncedByName, 'sync', `Synced ${result.issuesFetched} issues from Jira`, {
    integration: 'jira',
    action: 'completed',
    issuesFetched: result.issuesFetched,
    commentsFetched: result.commentsFetched,
    knowledgeCreated: result.knowledgeCreated,
  })

  console.info('[jira/sync] summary', {
    workspaceId: params.workspaceId,
    integrationId: params.integrationId,
    cloudId,
    projectsScanned: result.projectsScanned,
    issuesFetched: result.issuesFetched,
    commentsFetched: result.commentsFetched,
    processed: result.processed,
    knowledgeCreated: result.knowledgeCreated,
    knowledgeUpdated: result.knowledgeUpdated,
    skippedReasons: result.skippedReasons,
    extractionErrors: result.extractionErrors,
    embeddingErrors: result.embeddingErrors,
    databaseErrors: result.databaseErrors,
  })

  return result
}
