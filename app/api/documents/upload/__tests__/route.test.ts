/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { saveUploadedDocument } from '@/lib/storage/documents'
import { POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/storage/documents', () => {
  const actual = jest.requireActual('@/lib/storage/documents')
  return { ...actual, saveUploadedDocument: jest.fn(), deleteDocumentFile: jest.fn() }
})
jest.mock('@/lib/db', () => ({
  prisma: {
    documentAttachment: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockSave = jest.mocked(saveUploadedDocument)
const mockCreate = jest.mocked(prisma.documentAttachment.create)
const mockUpdate = jest.mocked(prisma.documentAttachment.update)

function uploadRequest(file: File | null, message = '') {
  const form = new FormData()
  if (file) form.append('file', file)
  if (message) form.append('message', message)
  return POST(new Request('http://localhost/api/documents/upload', { method: 'POST', body: form }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({
    workspaceId: 'workspace-1',
    member: { role: 'admin', status: 'active', displayName: 'Ali' },
  } as never)
  mockCreate.mockResolvedValue({ id: 'doc-1', createdAt: new Date('2026-07-08T00:00:00Z') } as never)
  mockUpdate.mockResolvedValue({} as never)
  mockSave.mockResolvedValue({ storageKey: 'workspace-1/doc-1/notes.txt' })
})

it('returns 401 when unauthenticated', async () => {
  mockAuth.mockResolvedValue({ userId: null } as never)

  const res = await uploadRequest(new File(['hello'], 'notes.txt', { type: 'text/plain' }))

  expect(res.status).toBe(401)
  expect(mockCreate).not.toHaveBeenCalled()
})

it('rejects users outside the workspace', async () => {
  mockRequireWorkspaceMember.mockResolvedValue({ error: 'Forbidden', status: 403 } as never)

  const res = await uploadRequest(new File(['hello'], 'notes.txt', { type: 'text/plain' }))

  expect(res.status).toBe(403)
  expect(mockCreate).not.toHaveBeenCalled()
})

it('rejects a missing file with a friendly message', async () => {
  const res = await uploadRequest(null)

  expect(res.status).toBe(400)
  expect((await res.json()).error).toBe('Choose a file to upload.')
})

it('rejects unsupported file types', async () => {
  const res = await uploadRequest(new File(['x'], 'malware.exe', { type: 'application/octet-stream' }))

  expect(res.status).toBe(400)
  expect((await res.json()).error).toContain('Unsupported file type')
})

it('rejects oversized files', async () => {
  const big = new Uint8Array(10 * 1024 * 1024 + 1)
  const res = await uploadRequest(new File([big], 'big.txt', { type: 'text/plain' }))

  expect(res.status).toBe(400)
  expect((await res.json()).error).toContain('too large')
})

it('stores a text file with extraction and parsed assignment', async () => {
  const res = await uploadRequest(
    new File(['Delivered on time.'], 'bol.txt', { type: 'text/plain' }),
    'Attach this as BOL for load 12345',
  )

  expect(res.status).toBe(200)
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      workspaceId: 'workspace-1',
      fileName: 'bol.txt',
      source: 'datatruck',
      documentType: 'BOL',
      externalLoadId: '12345',
      extractionStatus: 'extracted',
      extractedText: 'Delivered on time.',
      uploadedByUserId: 'user-1',
    }),
  }))
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-1', documentId: 'doc-1' }))
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    data: { storageKey: 'workspace-1/doc-1/notes.txt', storageUrl: '/api/documents/doc-1' },
  }))

  const json = await res.json()
  expect(json.success).toBe(true)
  expect(json.document).toEqual(expect.objectContaining({
    id: 'doc-1',
    fileName: 'bol.txt',
    documentType: 'BOL',
    externalLoadId: '12345',
    source: 'datatruck',
    extractionStatus: 'extracted',
    textPreview: 'Delivered on time.',
  }))
  const body = JSON.stringify(json)
  expect(body).not.toContain('storageKey')
  expect(body).not.toContain(process.cwd())
})

it('sanitizes path-traversal filenames', async () => {
  const res = await uploadRequest(new File(['x'], '../../etc/passwd.txt', { type: 'text/plain' }))

  expect(res.status).toBe(200)
  const storedName = (mockCreate.mock.calls[0][0] as { data: { fileName: string } }).data.fileName
  expect(storedName).not.toContain('..')
  expect(storedName).not.toContain('/')
})

it('rolls back the row when file storage fails', async () => {
  mockSave.mockRejectedValue(new Error('disk full'))
  const mockDelete = jest.mocked(prisma.documentAttachment.delete)
  mockDelete.mockResolvedValue({} as never)

  const res = await uploadRequest(new File(['x'], 'notes.txt', { type: 'text/plain' }))

  expect(res.status).toBe(500)
  expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'doc-1' } })
})
