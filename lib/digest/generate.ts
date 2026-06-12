import { prisma } from '@/lib/db'
import { openai } from '@/lib/openai'
import { escapeXml } from '@/lib/utils'

export interface DigestStats {
  synced: number
  labeled: number
  queries: number
  alerts: number
}

export interface DigestHighlight {
  type: string
  text: string
}

export interface DigestContent {
  summary: string
  highlights: DigestHighlight[]
  stats: DigestStats
}

export interface DigestPrefs {
  focusAreas: string[]
  staleThresholdDays: number
  digestEnabled: boolean
  emailDigest: boolean
}

const DEFAULT_PREFS: DigestPrefs = {
  focusAreas: [],
  staleThresholdDays: 30,
  digestEnabled: true,
  emailDigest: false,
}

function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export async function generateDailyDigest(
  workspaceId: string,
  userId: string,
  prefs: DigestPrefs = DEFAULT_PREFS,
): Promise<DigestContent> {
  return generateDigest(workspaceId, userId, prefs, 1)
}

export async function generateWeeklyDigest(
  workspaceId: string,
  userId: string,
  prefs: DigestPrefs = DEFAULT_PREFS,
): Promise<DigestContent> {
  return generateDigest(workspaceId, userId, prefs, 7)
}

async function generateDigest(
  workspaceId: string,
  userId: string,
  prefs: DigestPrefs,
  days: number,
): Promise<DigestContent> {
  const since = windowStart(days)

  const [syncedCount, labeledCount, queriedCount, unresolvedAlerts, recentActivity] =
    await Promise.all([
      prisma.captureLog.count({ where: { workspaceId, status: 'captured', timestamp: { gte: since } } }),
      prisma.notionChunk.count({ where: { workspaceId, updatedAt: { gte: since } } }),
      prisma.queryLog.count({ where: { workspaceId, userId, createdAt: { gte: since } } }),
      prisma.alert.count({ where: { workspaceId, status: 'unread' } }),
      prisma.activityEvent.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { eventType: true, description: true, displayName: true },
      }),
    ])

  const stats: DigestStats = {
    synced: syncedCount,
    labeled: labeledCount,
    queries: queriedCount,
    alerts: unresolvedAlerts,
  }

  const focusNote = prefs.focusAreas.length > 0
    ? `The user's focus areas are: ${prefs.focusAreas.map(escapeXml).join(', ')}.`
    : ''

  const activitySummary = recentActivity
    .map((a) => `- [${escapeXml(a.eventType)}] ${escapeXml(a.description ?? '')} (by ${escapeXml(a.displayName ?? '')})`)
    .join('\n')

  const userContent = [
    `Stats for the last ${days === 1 ? '24 hours' : '7 days'}:`,
    `- Items captured: ${stats.synced}`,
    `- Chunks labeled/updated: ${stats.labeled}`,
    `- Queries run: ${stats.queries}`,
    `- Unresolved alerts: ${stats.alerts}`,
    '',
    'Recent activity:',
    activitySummary || '(none)',
    '',
    focusNote,
  ].join('\n')

  let summary = ''
  const highlights: DigestHighlight[] = []

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content:
            'You are Neuron, a workplace knowledge assistant. Write a concise, friendly digest summary (2–3 sentences) of what happened in the workspace. Be specific and helpful. Return only the summary text.',
        },
        { role: 'user', content: userContent },
      ],
    })
    summary = completion.choices[0]?.message?.content?.trim() ?? ''
  } catch (err) {
    console.error('[digest/generate] GPT-4o failed', err)
    summary = `${stats.synced} items captured, ${stats.labeled} chunks updated, ${stats.queries} queries in the last ${days === 1 ? '24 hours' : '7 days'}.`
  }

  if (stats.alerts > 0) highlights.push({ type: 'alert', text: `${stats.alerts} unresolved alert${stats.alerts === 1 ? '' : 's'} need attention` })
  if (stats.synced > 0) highlights.push({ type: 'sync', text: `${stats.synced} item${stats.synced === 1 ? '' : 's'} captured from integrations` })
  if (stats.queries > 0) highlights.push({ type: 'query', text: `You asked ${stats.queries} question${stats.queries === 1 ? '' : 's'}` })

  return { summary, highlights, stats }
}
