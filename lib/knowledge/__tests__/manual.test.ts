/**
 * @jest-environment node
 */
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import { deleteDocumentFile, saveUploadedDocument } from '@/lib/storage/documents'
import { createManualKnowledgeItemWithOptionalDocument } from '../manual'

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeItem: { create: jest.fn(), update: jest.fn() },
    documentAttachment: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn() }))
jest.mock('@/lib/storage/documents', () => {
  const actual = jest.requireActual('@/lib/storage/documents')
  return { ...actual, saveUploadedDocument: jest.fn(), deleteDocumentFile: jest.fn() }
})

const mockItemCreate = jest.mocked(prisma.knowledgeItem.create)
const mockDocCreate = jest.mocked(prisma.documentAttachment.create)
const mockDocDelete = jest.mocked(prisma.documentAttachment.delete)
const mockSave = jest.mocked(saveUploadedDocument)
const mockGenerateEmbedding = jest.mocked(generateEmbedding)

const baseParams = {
  workspaceId: 'workspace-1',
  source: 'datatruck',
  title: 'Customer requires signed BOL before payment',
  description: 'Always collect a signed BOL from the receiver.',
  category: 'rule',
  createdByUserId: 'user-1',
  createdByName: 'Ali',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockItemCreate.mockResolvedValue({
    id: 'item-1',
    content: 'x',
    category: 'rule',
    source: 'datatruck',
    sourceExternalId: 'manual:datatruck:uuid',
    createdAt: new Date('2026-07-08T00:00:00Z'),
  } as never)
  jest.mocked(prisma.knowledgeItem.update).mockResolvedValue({} as never)
  mockDocCreate.mockResolvedValue({
    id: 'doc-1',
    fileName: 'bol.txt',
    documentType: 'BOL',
    externalLoadId: '12345',
    extractionStatus: 'extracted',
    createdAt: new Date('2026-07-08T00:00:00Z'),
  } as never)
  jest.mocked(prisma.documentAttachment.update).mockResolvedValue({} as never)
  mockDocDelete.mockResolvedValue({} as never)
  mockSave.mockResolvedValue({ storageKey: 'workspace-1/doc-1/bol.txt' })
  jest.mocked(deleteDocumentFile).mockResolvedValue(undefined)
  mockGenerateEmbedding.mockResolvedValue([0.1])
})

it('creates a verified knowledge item with manual metadata', async () => {
  const result = await createManualKnowledgeItemWithOptionalDocument(baseParams)

  expect(mockItemCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      workspaceId: 'workspace-1',
      source: 'datatruck',
      category: 'rule',
      verified: true,
      verifiedBy: 'user-1',
      owner: 'Ali',
      visibility: 'team',
      sourceExternalId: expect.stringMatching(/^manual:datatruck:/),
      sourceMetadata: expect.objectContaining({
        manual: true,
        title: baseParams.title,
        label: 'rule',
        integration: 'datatruck',
        createdByUserId: 'user-1',
        createdByName: 'Ali',
      }),
    }),
  }))
  const content = (mockItemCreate.mock.calls[0][0] as { data: { content: string } }).data.content
  expect(content).toContain(baseParams.title)
  expect(content).toContain(baseParams.description)
  expect(result.knowledgeItem.id).toBe('item-1')
  expect(result.documentAttachment).toBeNull()
})

it('stores an attached file and links it in metadata and content', async () => {
  const result = await createManualKnowledgeItemWithOptionalDocument({
    ...baseParams,
    externalLoadId: '12345',
    documentType: 'BOL',
    file: {
      fileName: 'bol.txt',
      mimeType: 'text/plain',
      fileSize: 18,
      buffer: Buffer.from('Signed by receiver'),
    },
  })

  expect(mockDocCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      workspaceId: 'workspace-1',
      source: 'datatruck',
      documentType: 'BOL',
      externalLoadId: '12345',
      extractionStatus: 'extracted',
      sourceExternalId: expect.stringMatching(/^manual:datatruck:document:/),
    }),
  }))
  const itemData = (mockItemCreate.mock.calls[0][0] as { data: { content: string; sourceMetadata: Record<string, unknown> } }).data
  expect(itemData.sourceMetadata.documentId).toBe('doc-1')
  expect(itemData.sourceMetadata.externalLoadId).toBe('12345')
  expect(itemData.sourceMetadata.documentType).toBe('BOL')
  expect(itemData.content).toContain('Signed by receiver')
  expect(result.documentAttachment?.storageUrl).toBe('/api/documents/doc-1')
})

it('still creates the knowledge item when file storage fails', async () => {
  mockSave.mockRejectedValue(new Error('disk full'))

  const result = await createManualKnowledgeItemWithOptionalDocument({
    ...baseParams,
    file: { fileName: 'bol.txt', mimeType: 'text/plain', fileSize: 5, buffer: Buffer.from('hello') },
  })

  expect(mockDocDelete).toHaveBeenCalled()
  expect(result.documentAttachment).toBeNull()
  expect(result.knowledgeItem.id).toBe('item-1')
})

it('tolerates embedding failure', async () => {
  mockGenerateEmbedding.mockRejectedValue(new Error('no api key'))

  const result = await createManualKnowledgeItemWithOptionalDocument(baseParams)

  expect(result.knowledgeItem.id).toBe('item-1')
})
