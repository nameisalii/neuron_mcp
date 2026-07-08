/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { readDocumentFile } from '@/lib/storage/documents'
import { GET } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/storage/documents', () => ({ readDocumentFile: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: { documentAttachment: { findFirst: jest.fn() } },
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockRead = jest.mocked(readDocumentFile)
const mockFindFirst = jest.mocked(prisma.documentAttachment.findFirst)

function request(id: string) {
  return GET(new Request(`http://localhost/api/documents/${id}`), { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({
    workspaceId: 'workspace-1',
    member: { role: 'admin', status: 'active', displayName: 'Ali' },
  } as never)
})

it('returns 401 when unauthenticated', async () => {
  mockAuth.mockResolvedValue({ userId: null } as never)

  expect((await request('doc-1')).status).toBe(401)
})

it('returns 404 for documents outside the workspace', async () => {
  mockFindFirst.mockResolvedValue(null as never)

  const res = await request('foreign-doc')

  expect(res.status).toBe(404)
  expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'foreign-doc', workspaceId: 'workspace-1' },
  }))
})

it('streams the file with its stored content type', async () => {
  mockFindFirst.mockResolvedValue({
    fileName: 'bol.pdf',
    mimeType: 'application/pdf',
    storageKey: 'workspace-1/doc-1/bol.pdf',
  } as never)
  mockRead.mockResolvedValue(Buffer.from('%PDF-1.4 test'))

  const res = await request('doc-1')

  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Type')).toBe('application/pdf')
  expect(res.headers.get('Content-Disposition')).toContain('bol.pdf')
  expect(await res.text()).toContain('%PDF-1.4')
})
