import { extractAndCreateSuggestedTaskFromKnowledgeItem, suggestTasksFromKnowledgeItem, taskDedupeKey } from '../service'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({ prisma: { task: { create: jest.fn(), findFirst: jest.fn() }, knowledgeItem: { findFirst: jest.fn() } } }))
jest.mock('../ai-extract', () => ({ isAiTaskExtractionEnabled: () => false, extractTaskWithAi: jest.fn() }))

const item = { id: 'ki-1', workspaceId: 'ws-1', content: 'Please send invoice by Friday.', source: 'telegram', sourceExternalId: 'message-1', sourceUrl: null }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(prisma.task.findFirst).mockResolvedValue(null)
})

test('dedupe key is stable for normalized titles and source identity', () => {
  expect(taskDedupeKey({ title: 'Send invoice!', sourceType: 'telegram', sourceId: 'message-1' }))
    .toBe(taskDedupeKey({ title: ' send   invoice ', sourceType: 'telegram', sourceId: 'message-1' }))
})

test('duplicate suggested tasks are ignored', async () => {
  jest.mocked(prisma.task.create).mockRejectedValue({ code: 'P2002' })
  await expect(suggestTasksFromKnowledgeItem(item)).resolves.toEqual([])
})

test('extracted tasks preserve source fields', async () => {
  jest.mocked(prisma.task.create).mockResolvedValue({ id: 'task-1' } as never)
  await suggestTasksFromKnowledgeItem({ ...item, sourceTitle: 'Dispatch chat', sourceUrl: 'https://example.com/message' })
  expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceType: 'telegram', sourceTitle: 'Dispatch chat', sourceSnippet: 'Please send invoice by Friday.', sourceUrl: 'https://example.com/message', extractedFromKnowledgeItemId: 'ki-1' }) }))
})

test('an already extracted KnowledgeItem does not create another task', async () => {
  jest.mocked(prisma.task.findFirst).mockResolvedValue({ id: 'existing' } as never)
  await expect(suggestTasksFromKnowledgeItem(item)).resolves.toEqual([])
  expect(prisma.task.create).not.toHaveBeenCalled()
})

test('loads a Telegram KnowledgeItem by id and creates its suggested task', async () => {
  jest.mocked(prisma.knowledgeItem.findFirst).mockResolvedValue({
    ...item, notionPageTitle: null, sourceCreatedAt: new Date('2026-07-20T10:00:00.000Z'),
    sourceMetadata: { chatTitle: 'Product chat' },
  } as never)
  jest.mocked(prisma.task.create).mockResolvedValue({ id: 'created-task', title: 'Send invoice' } as never)
  const result = await extractAndCreateSuggestedTaskFromKnowledgeItem({ knowledgeItemId: 'ki-1', workspaceId: 'ws-1' })
  expect(result.status).toBe('created')
  expect(prisma.knowledgeItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'ki-1', workspaceId: 'ws-1' },
  }))
})
