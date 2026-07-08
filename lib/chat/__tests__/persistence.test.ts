import { prisma } from '@/lib/db'
import { createOrAppendConversation, storeAssistantMessage, titleFromQuestion } from '../persistence'
import { generateConversationTitle } from '../title'

jest.mock('@/lib/db', () => ({
  prisma: {
    chatConversation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    chatMessage: {
      create: jest.fn(),
    },
    chatAnalyticsEvent: {
      create: jest.fn(),
    },
  },
}))

const mockConversationFindFirst = jest.mocked(prisma.chatConversation.findFirst)
const mockConversationCreate = jest.mocked(prisma.chatConversation.create)
const mockConversationUpdate = jest.mocked(prisma.chatConversation.update)
const mockMessageCreate = jest.mocked(prisma.chatMessage.create)

beforeEach(() => {
  jest.clearAllMocks()
  mockConversationFindFirst.mockResolvedValue(null)
  mockConversationCreate.mockResolvedValue({ id: 'conversation-1' } as never)
  mockConversationUpdate.mockResolvedValue({ id: 'conversation-1' } as never)
  mockMessageCreate.mockResolvedValue({ id: 'message-1' } as never)
  jest.mocked(prisma.chatAnalyticsEvent.create).mockResolvedValue({ id: 'event-1' } as never)
})

describe('chat titleFromQuestion', () => {
  it('creates a BOL load title from a load question', () => {
    expect(titleFromQuestion('Find BOL for load 12345')).toBe('BOL for Load 12345')
  })

  it('creates a load title from a generic load question', () => {
    expect(titleFromQuestion('What happened with load 8821 yesterday?')).toBe('Load 8821')
  })

  it('creates useful deterministic titles for common topics', () => {
    expect(titleFromQuestion('What does Neuron know about Telegram?')).toBe('What does Neuron know about Telegram?')
    expect(titleFromQuestion('Calculate revenue per employee')).toBe('Calculate revenue per employee')
    expect(titleFromQuestion('Can you check Datatruck sync status?')).toBe('Datatruck')
    expect(titleFromQuestion('what is our CTA and public website?')).toBe('CTA and public website')
  })
})

describe('generateConversationTitle', () => {
  it('creates document/load titles deterministically', () => {
    expect(generateConversationTitle('Find POD for load 12345')).toBe('POD for Load 12345')
    expect(generateConversationTitle('Need rate confirmation for load 12345')).toBe('Rate Confirmation for Load 12345')
    expect(generateConversationTitle('Find invoice for load 12345')).toBe('Invoice for Load 12345')
    expect(generateConversationTitle('What happened with 12345?')).toBe('Load 12345')
  })

  it('falls back to trimmed first question and empty fallback', () => {
    expect(generateConversationTitle('   ')).toBe('New conversation')
    expect(generateConversationTitle(` ${'a'.repeat(70)} `)).toBe('a'.repeat(60))
  })
})

describe('chat persistence helpers', () => {
  it('creates a new conversation and saves the user message', async () => {
    await expect(createOrAppendConversation({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      question: 'Find BOL for load 12345',
    })).resolves.toEqual({ conversationId: 'conversation-1', relatedLoadId: '12345' })

    expect(mockConversationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        userId: 'user-1',
        title: 'BOL for Load 12345',
        relatedLoadId: '12345',
      }),
    }))
    expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        conversationId: 'conversation-1',
        role: 'user',
        content: 'Find BOL for load 12345',
      }),
    }))
  })

  it('appends a user message to an existing accessible conversation', async () => {
    mockConversationFindFirst.mockResolvedValue({ id: 'conversation-existing' } as never)
    mockConversationUpdate.mockResolvedValue({ id: 'conversation-existing' } as never)

    await createOrAppendConversation({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      question: 'give me shorter version',
      conversationId: 'conversation-existing',
    })

    expect(mockConversationFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'conversation-existing', workspaceId: 'workspace-1', userId: 'user-1' },
    }))
    expect(mockConversationCreate).not.toHaveBeenCalled()
    expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        conversationId: 'conversation-existing',
        role: 'user',
        content: 'give me shorter version',
      }),
    }))
  })

  it('rejects appending to an inaccessible conversation', async () => {
    mockConversationFindFirst.mockResolvedValue(null)

    await expect(createOrAppendConversation({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      question: 'give me shorter version',
      conversationId: 'other-workspace-conversation',
    })).rejects.toThrow('Conversation not found or not accessible')
    expect(mockMessageCreate).not.toHaveBeenCalled()
  })

  it('stores assistant messages after answering', async () => {
    await storeAssistantMessage({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      conversationId: 'conversation-1',
      answer: 'Short answer.',
      sourceReferences: [],
      documentReferences: [],
      metadata: { confidence: 90 },
    })

    expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        conversationId: 'conversation-1',
        role: 'assistant',
        content: 'Short answer.',
        sourceReferences: [],
        documentReferences: [],
      }),
    }))
  })
})
