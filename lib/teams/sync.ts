import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { trackEvent } from '@/lib/activity'
import { extractKnowledgeDetailed, type ExtractionDiagnostics } from '@/lib/extraction/extractor'
import { generateEmbedding } from '@/lib/openai'
import { upsertEmbedding } from '@/lib/pinecone'
import type { SlackMessage } from '@/types'
import {
  TeamsApiError,
  decodeTeamsToken,
  encodeTeamsToken,
  listChannelMessages,
  listJoinedTeams,
  listTeamChannels,
  refreshTeamsToken,
  type GraphChannel,
  type GraphChannelMessage,
  type GraphTeam,
} from './api'
import { shouldSkipTeamsText, teamsMessageText } from './text'

const MAX_TEAMS = 10
const MAX_CHANNELS_PER_TEAM = 20
const MESSAGES_PER_CHANNEL = 50

export interface TeamsSyncResult {
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
  teamsScanned: number
  channelsScanned: number
  reconnectNeeded?: boolean
  adminConsentRequired?: boolean
  message?: string
}

interface TeamsSyncParams {
  workspaceId: string
  integrationId: string
  encryptedToken: string
  selectedChannels: string[]
  syncedBy: string
  syncedByName: string
}

function increment(target: Record<string, number>, reason: string): void {
  target[reason] = (target[reason] ?? 0) + 1
}

function extractionErrorCount(diagnostics: ExtractionDiagnostics): number {
  return diagnostics.extractorParseFailed + diagnostics.validationFailed + diagnostics.itemProcessingFailed
}

function stableExternalId(teamId: string, channelId: string, messageId: string): string {
  return `${teamId}:${channelId}:${messageId}`
}

function contentHash(externalId: string): string {
  return `teams:${createHash('sha256').update(externalId).digest('hex')}`
}

function asExtractionMessage(message: GraphChannelMessage, text: string, channel: GraphChannel): SlackMessage {
  return {
    text,
    user: message.from?.user?.displayName || 'Teams member',
    channel: channel.displayName || 'Teams channel',
    ts: message.createdDateTime ? String(new Date(message.createdDateTime).getTime() / 1000) : String(Date.now() / 1000),
    permalink: message.webUrl ?? undefined,
  }
}

function isUnsupportedMessage(message: GraphChannelMessage): string | null {
  if (message.deletedDateTime) return 'deleted_message'
  if (message.from?.application) return 'bot_message'
  if (message.messageType && message.messageType !== 'message') return 'system_message'
  return null
}

function emptyResult(extra: Partial<TeamsSyncResult> = {}): TeamsSyncResult {
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
    teamsScanned: 0,
    channelsScanned: 0,
    ...extra,
  }
}

function isPermissionError(error: unknown): boolean {
  return error instanceof TeamsApiError && (error.status === 401 || error.status === 403)
}

function selectedChannelKey(teamId: string, channelId: string): string {
  return `${teamId}:${channelId}`
}

export async function syncTeams(params: TeamsSyncParams): Promise<TeamsSyncResult> {
  const result = emptyResult()
  const token = decodeTeamsToken(params.encryptedToken)
  if (!token) {
    return emptyResult({
      success: false,
      reconnectNeeded: true,
      message: 'Microsoft Teams needs to be reconnected.',
    })
  }

  let activeToken = token
  try {
    activeToken = await refreshTeamsToken(token)
    if (activeToken.accessToken !== token.accessToken || activeToken.refreshToken !== token.refreshToken) {
      await prisma.integration.update({
        where: { id: params.integrationId },
        data: { accessToken: encodeTeamsToken(activeToken) },
      })
    }
  } catch {
    return emptyResult({
      success: false,
      reconnectNeeded: true,
      message: 'Microsoft Teams token refresh failed. Reconnect Teams.',
    })
  }

  const selected = new Set(params.selectedChannels)
  let teams: GraphTeam[]
  try {
    teams = await listJoinedTeams(activeToken.accessToken, MAX_TEAMS)
  } catch (error) {
    if (isPermissionError(error)) {
      return emptyResult({
        success: false,
        adminConsentRequired: true,
        message: 'Microsoft Graph could not read joined Teams. Your tenant may require admin consent for Teams message scopes.',
      })
    }
    throw error
  }

  for (const team of teams) {
    result.teamsScanned++
    let channels: GraphChannel[] = []
    try {
      channels = await listTeamChannels(activeToken.accessToken, team.id, MAX_CHANNELS_PER_TEAM)
    } catch (error) {
      if (isPermissionError(error)) {
        increment(result.skippedReasons, 'permission_denied')
        result.skipped++
        continue
      }
      throw error
    }

    for (const channel of channels) {
      if (selected.size > 0 && !selected.has(selectedChannelKey(team.id, channel.id))) continue
      result.channelsScanned++

      let messages: GraphChannelMessage[] = []
      try {
        messages = await listChannelMessages(activeToken.accessToken, team.id, channel.id, MESSAGES_PER_CHANNEL)
      } catch (error) {
        if (isPermissionError(error)) {
          increment(result.skippedReasons, 'permission_denied')
          result.skipped++
          continue
        }
        throw error
      }
      result.fetched += messages.length

      for (const message of messages) {
        const unsupportedReason = isUnsupportedMessage(message)
        if (unsupportedReason) {
          increment(result.skippedReasons, unsupportedReason)
          result.skipped++
          continue
        }

        const text = teamsMessageText(message.body?.content, message.body?.contentType)
        const quality = shouldSkipTeamsText(text)
        if (quality.skip) {
          increment(result.skippedReasons, quality.reason ?? 'too_short')
          result.skipped++
          continue
        }

        const sourceExternalId = stableExternalId(team.id, channel.id, message.id)
        const existing = await prisma.knowledgeItem.findFirst({
          where: { workspaceId: params.workspaceId, source: 'teams', sourceExternalId },
          select: { id: true },
        })
        if (existing) {
          increment(result.skippedReasons, 'duplicate')
          result.skipped++
          continue
        }

        let dbItem: { id: string }
        try {
          dbItem = await prisma.knowledgeItem.create({
            data: {
              workspaceId: params.workspaceId,
              content: text,
              contentHash: contentHash(sourceExternalId),
              category: 'fact',
              aiSuggestedCategory: 'fact',
              source: 'teams',
              sourceExternalId,
              sourceUrl: message.webUrl ?? null,
              sourceMetadata: {
                teamId: team.id,
                channelId: channel.id,
                messageId: message.id,
                createdDateTime: message.createdDateTime ?? null,
                fromDisplayName: message.from?.user?.displayName ?? null,
              },
              owner: message.from?.user?.displayName ?? null,
              confidence: 0.55,
              visibility: 'team',
              sourceCreatedAt: message.createdDateTime ? new Date(message.createdDateTime) : null,
            },
            select: { id: true },
          })
          result.knowledgeCreated++
          result.processed++
        } catch (error) {
          if ((error as { code?: string })?.code === 'P2002') {
            increment(result.skippedReasons, 'duplicate')
            result.skipped++
          } else {
            result.databaseErrors++
            increment(result.skippedReasons, 'database_error')
            result.skipped++
          }
          continue
        }

        try {
          const embedding = await generateEmbedding(text)
          await upsertEmbedding(dbItem.id, embedding, {
            workspaceId: params.workspaceId,
            category: 'fact',
            source: 'teams',
          })
          await prisma.knowledgeItem.update({ where: { id: dbItem.id }, data: { embeddingId: dbItem.id } })
          result.knowledgeUpdated++
        } catch {
          result.embeddingErrors++
        }

        try {
          const extraction = await extractKnowledgeDetailed(
            [asExtractionMessage(message, text, channel)],
            params.workspaceId,
            'teams',
            message.webUrl ?? undefined,
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
    }
  }

  await prisma.integration.update({
    where: { id: params.integrationId },
    data: { lastSyncAt: new Date() },
  })

  await trackEvent(params.workspaceId, params.syncedBy, params.syncedByName, 'sync', `Synced ${result.fetched} messages from Microsoft Teams`, {
    integration: 'teams',
    action: 'completed',
    teamsScanned: result.teamsScanned,
    channelsScanned: result.channelsScanned,
    fetched: result.fetched,
    processed: result.processed,
    knowledgeCreated: result.knowledgeCreated,
  })

  console.info('[teams/sync] summary', {
    workspaceId: params.workspaceId,
    integrationId: params.integrationId,
    teamsScanned: result.teamsScanned,
    channelsScanned: result.channelsScanned,
    fetched: result.fetched,
    processed: result.processed,
    knowledgeCreated: result.knowledgeCreated,
    knowledgeUpdated: result.knowledgeUpdated,
    skipped: result.skipped,
    skippedReasons: result.skippedReasons,
    extractionErrors: result.extractionErrors,
    embeddingErrors: result.embeddingErrors,
    databaseErrors: result.databaseErrors,
  })

  return result
}
