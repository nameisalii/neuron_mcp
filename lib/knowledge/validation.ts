import { z } from 'zod'

export const knowledgeStatuses = ['verified', 'unverified', 'needs_review', 'outdated', 'conflicting', 'archived'] as const
export const knowledgeStatusSchema = z.enum(knowledgeStatuses)

export const updateKnowledgeSchema = z.object({
  title: z.string().trim().max(180).nullable().optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().min(1).max(60).optional(),
  status: knowledgeStatusSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required')
