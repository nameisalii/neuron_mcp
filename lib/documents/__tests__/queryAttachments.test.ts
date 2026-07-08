/**
 * @jest-environment node
 */
import { prisma } from '@/lib/db'
import { generateEmbedding } from '@/lib/openai'
import {
  applyDocumentAssignment,
  attachedDocumentContext,
  loadWorkspaceDocuments,
  toDocumentResults,
  type AttachedDocument,
} from '../queryAttachments'

jest.mock('@/lib/db', () => ({
  prisma: {
    documentAttachment: { findMany: jest.fn(), update: jest.fn() },
    knowledgeItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/openai', () => ({ generateEmbedding: jest.fn() }))
jest.mock('@/lib/pinecone', () => ({ upsertEmbedding: jest.fn() }))

const mockFindMany = jest.mocked(prisma.documentAttachment.findMany)
const mockDocumentUpdate = jest.mocked(prisma.documentAttachment.update)
const mockKnowledgeFindFirst = jest.mocked(prisma.knowledgeItem.findFirst)
const mockKnowledgeCreate = jest.mocked(prisma.knowledgeItem.create)
const mockGenerateEmbedding = jest.mocked(generateEmbedding)

function makeDocument(overrides: Partial<AttachedDocument> = {}): AttachedDocument {
  return {
    id: 'doc-1',
    fileName: 'bol.pdf',
    documentType: null,
    externalLoadId: null,
    source: 'manual_upload',
    createdAt: new Date('2026-07-08T00:00:00Z'),
    sourceUrl: null,
    storageUrl: '/api/documents/doc-1',
    extractedText: 'Bill of lading for load 12345. Shipper: Acme.',
    extractionStatus: 'extracted',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDocumentUpdate.mockResolvedValue({} as never)
  mockKnowledgeFindFirst.mockResolvedValue(null as never)
  mockKnowledgeCreate.mockResolvedValue({ id: 'item-1' } as never)
  jest.mocked(prisma.knowledgeItem.update).mockResolvedValue({} as never)
  mockGenerateEmbedding.mockResolvedValue([0.1])
})

it('rejects document ids that do not all belong to the workspace', async () => {
  mockFindMany.mockResolvedValue([makeDocument()] as never)

  const result = await loadWorkspaceDocuments('workspace-1', ['doc-1', 'foreign-doc'])

  expect(result).toBeNull()
})

it('loads workspace documents scoped by workspaceId', async () => {
  mockFindMany.mockResolvedValue([makeDocument()] as never)

  const result = await loadWorkspaceDocuments('workspace-1', ['doc-1'])

  expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: { in: ['doc-1'] }, workspaceId: 'workspace-1' },
  }))
  expect(result).toHaveLength(1)
})

it('applies BOL/load assignment from the question and creates a knowledge item', async () => {
  const [updated] = await applyDocumentAssignment('workspace-1', 'Attach this as BOL for load 12345', [makeDocument()])

  expect(updated.documentType).toBe('BOL')
  expect(updated.externalLoadId).toBe('12345')
  expect(updated.source).toBe('datatruck')
  expect(mockDocumentUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'doc-1' },
    data: { documentType: 'BOL', externalLoadId: '12345', source: 'datatruck' },
  }))
  expect(mockKnowledgeCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      workspaceId: 'workspace-1',
      source: 'datatruck',
      sourceExternalId: 'document:doc-1',
      sourceMetadata: expect.objectContaining({
        documentId: 'doc-1',
        fileName: 'bol.pdf',
        assignedTo: 'datatruck',
      }),
    }),
  }))
})

it('keeps answering when knowledge persistence fails', async () => {
  mockKnowledgeCreate.mockRejectedValue(new Error('db down'))

  const updated = await applyDocumentAssignment('workspace-1', 'Read this file', [makeDocument()])

  expect(updated).toHaveLength(1)
})

it('includes extracted text in the attached-document context', () => {
  const context = attachedDocumentContext([makeDocument({ documentType: 'BOL', externalLoadId: '12345' })])

  expect(context).toContain('File: bol.pdf')
  expect(context).toContain('Load: 12345')
  expect(context).toContain('Bill of lading for load 12345')
})

it('explains missing text for unextracted files instead of omitting them', () => {
  const context = attachedDocumentContext([makeDocument({ extractedText: null, extractionStatus: 'needs_ocr' })])

  expect(context).toContain('needs_ocr')
  expect(context).toContain('No readable text')
})

it('maps attached documents to Resources entries with open links', () => {
  const [result] = toDocumentResults([makeDocument({ documentType: 'BOL' })])

  expect(result).toEqual(expect.objectContaining({
    id: 'doc-1',
    fileName: 'bol.pdf',
    documentType: 'BOL',
    storageUrl: '/api/documents/doc-1',
  }))
  expect(result.snippet).toContain('Bill of lading')
})
