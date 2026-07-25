import { prisma } from '@/lib/db'
import { suggestTasksFromKnowledgeItem } from '../service'
import { extractTaskWithAi } from '../ai-extract'

jest.mock('@/lib/db', () => ({ prisma: { task: { create: jest.fn(), findFirst: jest.fn() } } }))
jest.mock('../ai-extract', () => ({
  isAiTaskExtractionEnabled: () => true,
  extractTaskWithAi: jest.fn(),
}))

const item = {
  id: 'ki-logo', workspaceId: 'ws-1',
  content: 'hi ali can you finish the front of the logo please due tomorrow 5 pm (priority is medium)',
  source: 'telegram', sourceExternalId: 'chat:42', sourceUrl: null, sourceTitle: 'Product chat',
  sourceCreatedAt: new Date('2026-07-20T16:00:00.000Z'),
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(prisma.task.findFirst).mockResolvedValue(null)
  jest.mocked(prisma.task.create).mockResolvedValue({ id: 'task-1' } as never)
})

test('creates an AI-suggested Telegram task with source context', async () => {
  jest.mocked(extractTaskWithAi).mockResolvedValue({
    isTask: true, title: 'Finish the front of the logo',
    description: 'Ali was asked in Telegram to finish the front of the logo.',
    priority: 'medium', category: 'startup', dueAt: '2026-07-21T17:00:00-07:00',
    assigneeName: 'Ali', confidence: 0.92, reason: 'Clear request.',
  })
  await suggestTasksFromKnowledgeItem(item)

  expect(prisma.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    status: 'suggested', title: 'Finish the front of the logo', priority: 'medium',
    sourceType: 'telegram', sourceSnippet: item.content, extractedFromKnowledgeItemId: 'ki-logo',
    metadata: { extractionMethod: 'ai', assigneeName: 'Ali' },
  }) })
})

test('falls back to deterministic extraction when OpenAI fails', async () => {
  jest.mocked(extractTaskWithAi).mockRejectedValue(new Error('provider unavailable'))
  await expect(suggestTasksFromKnowledgeItem(item)).resolves.toHaveLength(1)
  expect(prisma.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    status: 'suggested', sourceType: 'telegram', metadata: { extractionMethod: 'deterministic' },
  }) })
})
