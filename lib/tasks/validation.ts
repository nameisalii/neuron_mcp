import { z } from 'zod'

export const taskStatuses = ['suggested', 'active', 'completed', 'declined', 'archived'] as const
export const taskPriorities = ['low', 'medium', 'high', 'urgent'] as const
export const taskCategories = ['work', 'school', 'startup', 'truck', 'personal', 'other'] as const
export const taskSources = ['manual', 'slack', 'gmail', 'telegram', 'discord', 'linear', 'notion', 'datatruck', 'five_eld', 'other'] as const

const nullableDate = z.union([z.string().datetime(), z.string().date(), z.null()]).transform((value) => value ? new Date(value) : null)
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()

const taskFields = {
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(taskPriorities),
  category: z.enum(taskCategories),
  dueAt: nullableDate.optional(),
  assignedToUserId: z.string().trim().min(1).nullable().optional(),
  sourceType: z.enum(taskSources),
  sourceTitle: nullableText(300),
  sourceSnippet: nullableText(2000),
  sourceUrl: z.union([z.string().trim().url(), z.literal(''), z.null()]).transform((value) => value || null).optional(),
}

export const createTaskSchema = z.object(taskFields).extend({
  priority: z.enum(taskPriorities).default('medium'),
  category: z.enum(taskCategories).default('work'),
  sourceType: z.enum(taskSources).default('manual'),
})

export const updateTaskSchema = z.object(taskFields).partial().extend({
  status: z.enum(taskStatuses).optional(),
}).refine((value) => Object.keys(value).length > 0, 'No changes provided')

export const reminderSchema = z.object({
  reminderAt: z.string().datetime(),
})

export const feedbackSchema = z.object({
  reason: z.enum(['Wrong task', 'Wrong due date', 'Wrong priority', 'Not a task']),
  note: z.string().trim().max(1000).optional().default(''),
})
