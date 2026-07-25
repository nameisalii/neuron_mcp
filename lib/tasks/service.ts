import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { extractTasks, normalizeTaskTitle } from './extract'
import { extractTaskWithAi, isAiTaskExtractionEnabled, type AiTaskExtraction } from './ai-extract'

export type KnowledgeForTasks = {
  id: string
  workspaceId: string
  content: string
  source: string
  sourceExternalId: string | null
  sourceUrl: string | null
  notionPageTitle?: string | null
  sourceTitle?: string | null
  sourceCreatedAt?: Date | null
}

export type TaskExtractionResult = {
  status: 'created' | 'skipped'
  tasks: Awaited<ReturnType<typeof suggestTasksFromKnowledgeItem>>
  reason?: string
}

type TaskSuggestion = {
  title: string
  description?: string | null
  dueAt: Date | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  category: 'work' | 'school' | 'startup' | 'truck' | 'personal' | 'other'
  sourceSnippet: string
  confidence: number
  extractionMethod: 'ai' | 'deterministic'
  assigneeName?: string | null
}

export function taskDedupeKey(input: { title: string; sourceType?: string | null; sourceId?: string | null; knowledgeItemId?: string | null; sourceSnippet?: string | null }) {
  const identity = input.sourceId || input.knowledgeItemId || input.sourceSnippet?.slice(0, 160) || ''
  return createHash('sha256').update(`${normalizeTaskTitle(input.title)}|${input.sourceType ?? 'unknown'}|${identity}`).digest('hex')
}

export async function suggestTasksFromKnowledgeItem(item: KnowledgeForTasks) {
  const existing = await prisma.task.findFirst({
    where: { workspaceId: item.workspaceId, extractedFromKnowledgeItemId: item.id },
    select: { id: true },
  })
  if (existing) {
    debugTaskExtraction(item, { taskCreated: false, skippedReason: 'knowledge_item_already_extracted' })
    return []
  }

  const extracted: TaskSuggestion[] = []
  const deterministic = extractTasks(item.content, { sourceType: item.source, now: item.sourceCreatedAt ?? new Date() })
  let aiResult: AiTaskExtraction | null = null
  if (isAiTaskExtractionEnabled()) {
    try {
      aiResult = await extractTaskWithAi({
        text: item.content,
        sourceType: item.source,
        sourceTitle: item.sourceTitle ?? item.notionPageTitle,
        sourceUrl: item.sourceUrl,
        createdAt: item.sourceCreatedAt,
      })
      if (aiResult.isTask && aiResult.confidence >= 0.65 && aiResult.title) {
        extracted.push({
          // Deterministic cleanup is intentionally preferred when it found the
          // same obvious request; AI enriches description/category/assignee.
          title: deterministic[0]?.title ?? aiResult.title,
          description: aiResult.description,
          dueAt: deterministic[0]?.dueAt ?? (aiResult.dueAt ? new Date(aiResult.dueAt) : null),
          priority: deterministic[0]?.priority ?? aiResult.priority ?? 'medium',
          category: aiResult.category ?? 'work',
          sourceSnippet: item.content.slice(0, 300),
          confidence: Math.max(aiResult.confidence, deterministic[0]?.confidence ?? 0),
          extractionMethod: 'ai',
          assigneeName: aiResult.assigneeName,
        })
      }
      debugTaskExtraction(item, {
        extractionMethod: 'ai', isTask: aiResult.isTask, confidence: aiResult.confidence,
        taskCreated: false, skippedReason: extracted.length ? undefined : aiResult.confidence < 0.65 ? 'low_confidence' : 'not_a_task',
      })
    } catch (error) {
      debugTaskExtraction(item, { extractionMethod: 'ai', taskCreated: false, skippedReason: 'ai_error' })
      console.warn('[tasks] AI extraction unavailable; using deterministic fallback', error instanceof Error ? error.message : 'unknown error')
    }
  }

  if (!extracted.length) {
    extracted.push(...deterministic.map((suggestion) => ({ ...suggestion, extractionMethod: 'deterministic' as const })))
  }
  const created = []
  for (const suggestion of extracted) {
    const dedupeKey = taskDedupeKey({ title: suggestion.title, sourceType: item.source, sourceId: item.sourceExternalId, knowledgeItemId: item.id, sourceSnippet: suggestion.sourceSnippet })
    try {
      const task = await prisma.task.create({
        data: {
          workspaceId: item.workspaceId,
          title: suggestion.title,
          description: suggestion.description ?? null,
          dueAt: suggestion.dueAt,
          priority: suggestion.priority,
          category: suggestion.category,
          sourceSnippet: suggestion.sourceSnippet,
          confidence: suggestion.confidence,
          status: 'suggested',
          sourceType: item.source,
          sourceId: item.sourceExternalId,
          sourceUrl: item.sourceUrl,
          sourceTitle: item.sourceTitle ?? item.notionPageTitle ?? null,
          extractedFromKnowledgeItemId: item.id,
          dedupeKey,
          metadata: {
            extractionMethod: suggestion.extractionMethod,
            ...(suggestion.assigneeName ? { assigneeName: suggestion.assigneeName } : {}),
          },
          events: { create: { type: 'suggested', message: `Suggested task created from ${item.source}` } },
        },
      })
      created.push(task)
      debugTaskExtraction(item, {
        extractionMethod: suggestion.extractionMethod, isTask: true, confidence: suggestion.confidence, taskCreated: true,
      })
    } catch (error) {
      if (typeof error === 'object' && (error as { code?: string } | null)?.code === 'P2002') continue
      throw error
    }
  }
  return created
}

function debugTaskExtraction(item: KnowledgeForTasks, details: {
  extractionMethod?: 'ai' | 'deterministic'
  isTask?: boolean
  confidence?: number
  taskCreated: boolean
  skippedReason?: string
}) {
  if (process.env.TASK_EXTRACTION_DEBUG_SAFE !== 'true') return
  console.info('[tasks] safe-debug', {
    knowledgeItemId: item.id,
    sourceType: item.source,
    textLength: item.content.length,
    ...details,
  })
}

export async function safelySuggestTasksFromKnowledgeItem(item: KnowledgeForTasks) {
  try {
    return await suggestTasksFromKnowledgeItem(item)
  } catch (error) {
    console.error('[tasks] suggestion skipped', error instanceof Error ? error.message : 'unknown error')
    return []
  }
}

export async function extractAndCreateSuggestedTaskFromKnowledgeItem(input: {
  knowledgeItemId: string
  workspaceId: string
}): Promise<TaskExtractionResult> {
  const item = await prisma.knowledgeItem.findFirst({
    where: { id: input.knowledgeItemId, workspaceId: input.workspaceId },
    select: {
      id: true, workspaceId: true, content: true, source: true, sourceExternalId: true,
      sourceUrl: true, notionPageTitle: true, sourceCreatedAt: true, sourceMetadata: true,
    },
  })
  if (!item) return { status: 'skipped', tasks: [], reason: 'knowledge_item_not_found' }
  if (!item.content.trim()) return { status: 'skipped', tasks: [], reason: 'empty_text' }
  const metadata = item.sourceMetadata && typeof item.sourceMetadata === 'object' && !Array.isArray(item.sourceMetadata)
    ? item.sourceMetadata as Record<string, unknown> : {}
  const sourceTitle = [metadata.chatTitle, metadata.title].find((value) => typeof value === 'string') as string | undefined
  const tasks = await safelySuggestTasksFromKnowledgeItem({ ...item, sourceTitle })
  const reason = tasks.length ? undefined : await prisma.task.findFirst({
    where: { workspaceId: item.workspaceId, extractedFromKnowledgeItemId: item.id }, select: { id: true },
  }) ? 'already_extracted' : 'not_a_task'
  if (process.env.TASK_EXTRACTION_DEBUG_SAFE === 'true') {
    console.info('[tasks] knowledge-extraction', {
      knowledgeItemId: item.id,
      workspaceIdPresent: Boolean(item.workspaceId),
      sourceType: item.source,
      textLength: item.content.length,
      titleLength: tasks[0]?.title?.length ?? 0,
      extractionCalled: true,
      taskCreated: tasks.length > 0,
      skippedReason: reason,
    })
  }
  return { status: tasks.length ? 'created' : 'skipped', tasks, reason }
}
