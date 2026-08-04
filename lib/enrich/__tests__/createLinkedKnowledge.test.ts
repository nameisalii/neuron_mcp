/** @jest-environment node */

import { prisma } from '@/lib/db'
import { createLinkedKnowledge } from '../createLinkedKnowledge'

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn().mockRejectedValue(new Error('disabled in test')) }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn(), upsertEmbeddingInNamespace: jest.fn() }))

const parent = {
  id: 'parent-1',
  workspaceId: 'workspace-1',
  content: 'Read https://example.com/spec',
  source: 'slack',
  sourceExternalId: 'message-1',
  sourceMetadata: { channelName: '#eng' },
  visibility: 'personal',
  visibilitySetBy: 'user-1',
}

const resolved = {
  url: 'https://example.com/spec',
  normalizedUrl: 'https://example.com/spec',
  status: 'success' as const,
  title: 'Product spec',
  markdown: '# Product spec\nApproved architecture.',
  fetchedAt: new Date('2026-07-28T12:00:00Z'),
  sourceUrl: 'https://example.com/spec',
  parentKnowledgeItemId: 'parent-1',
  visibility: 'personal',
  visibilitySetBy: 'user-1',
  metadata: {
    parentWorkspaceId: 'workspace-1',
    parentSource: 'slack',
    parentSourceExternalId: 'message-1',
    cacheHit: false,
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(prisma.knowledgeItem.findUnique).mockResolvedValue(null)
  jest.mocked(prisma.knowledgeItem.create).mockResolvedValue({ id: 'child-1' } as never)
  jest.mocked(prisma.knowledgeItem.update).mockResolvedValue({} as never)
})

it('creates a workspace-scoped linked child with inherited personal visibility and provenance', async () => {
  await createLinkedKnowledge({ parent, resolved: [resolved] })

  expect(prisma.knowledgeItem.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      workspaceId: 'workspace-1',
      source: 'linked_page',
      sourceUrl: 'https://example.com/spec',
      sourceExternalId: 'https://example.com/spec',
      visibility: 'personal',
      visibilitySetBy: 'user-1',
      sourceMetadata: expect.objectContaining({
        parentWorkspaceId: 'workspace-1',
        parentKnowledgeItemId: 'parent-1',
        parentSource: 'slack',
        parentSourceExternalId: 'message-1',
        sourceUrl: 'https://example.com/spec',
        linkedFrom: expect.objectContaining({ channelName: '#eng' }),
      }),
    }),
    select: { id: true },
  })
})

it('rejects a resolved link whose parent or visibility scope does not match', async () => {
  await expect(createLinkedKnowledge({
    parent,
    resolved: [{ ...resolved, parentKnowledgeItemId: 'other-parent' }],
  })).rejects.toThrow('LINK_SCOPE_MISMATCH')

  await expect(createLinkedKnowledge({
    parent,
    resolved: [{ ...resolved, metadata: { ...resolved.metadata, parentWorkspaceId: 'other-workspace' } }],
  })).rejects.toThrow('LINK_SCOPE_MISMATCH')

  await expect(createLinkedKnowledge({
    parent,
    resolved: [{ ...resolved, visibility: 'team', visibilitySetBy: null }],
  })).rejects.toThrow('LINK_SCOPE_MISMATCH')
})

it('deduplicates by workspace, parent and normalized URL', async () => {
  jest.mocked(prisma.knowledgeItem.findUnique).mockResolvedValue({ id: 'existing-child' } as never)

  const result = await createLinkedKnowledge({ parent, resolved: [resolved] })

  expect(result).toEqual([{ id: 'existing-child', created: false }])
  expect(prisma.knowledgeItem.create).not.toHaveBeenCalled()
})
