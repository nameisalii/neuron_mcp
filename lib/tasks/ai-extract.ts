import OpenAI from 'openai'
import { z } from 'zod'

export const aiTaskExtractionSchema = z.object({
  isTask: z.boolean(),
  title: z.string().trim().min(1).max(180).nullable(),
  description: z.string().trim().max(1000).nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable(),
  category: z.enum(['work', 'school', 'startup', 'truck', 'personal', 'other']).nullable(),
  dueAt: z.string().datetime({ offset: true }).nullable(),
  assigneeName: z.string().trim().max(120).nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().max(500),
})

export type AiTaskExtraction = z.infer<typeof aiTaskExtractionSchema>

export type AiTaskExtractionInput = {
  text: string
  sourceType: string
  sourceTitle?: string | null
  sourceUrl?: string | null
  createdAt?: Date | null
  now?: Date
  timezone?: string
}

type ChatClient = Pick<OpenAI, 'chat'>

export function isAiTaskExtractionEnabled() {
  return process.env.TASK_AI_EXTRACTION_ENABLED !== 'false' && Boolean(process.env.OPENAI_API_KEY)
}

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI task extraction is not configured')
  return new OpenAI({ apiKey, timeout: 8_000, maxRetries: 0 })
}

export async function extractTaskWithAi(input: AiTaskExtractionInput, openaiClient: ChatClient = client()): Promise<AiTaskExtraction> {
  const now = input.now ?? new Date()
  const timezone = input.timezone || process.env.TASK_DEFAULT_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const response = await openaiClient.chat.completions.create({
    model: process.env.OPENAI_TASK_EXTRACTION_MODEL || 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You extract actionable tasks from workplace messages. Return only valid JSON matching the requested schema. Do not invent tasks. Only set isTask=true when the message clearly asks someone to do something, includes a deadline or follow-up, or assigns responsibility. General facts, FYI notices, completed actions, jokes, and small talk are not tasks. Resolve relative dates using the supplied current time and timezone.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          source: input.sourceType,
          sourceTitle: input.sourceTitle ?? null,
          sourceUrl: input.sourceUrl ?? null,
          messageTimestamp: input.createdAt?.toISOString() ?? null,
          currentDateTime: now.toISOString(),
          timezone,
          message: input.text,
          outputSchema: {
            isTask: 'boolean', title: 'string|null', description: 'string|null',
            priority: 'low|medium|high|urgent|null', category: 'work|school|startup|truck|personal|other|null',
            dueAt: 'ISO datetime with timezone offset|null', assigneeName: 'string|null',
            confidence: 'number 0..1', reason: 'string',
          },
        }),
      },
    ],
  })
  const raw = response.choices[0]?.message?.content
  if (!raw) throw new Error('OpenAI returned no task extraction')
  return aiTaskExtractionSchema.parse(JSON.parse(raw))
}
