/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { trackEvent } from '@/lib/activity'
import { createManualKnowledgeItemWithOptionalDocument } from '@/lib/knowledge/manual'
import { POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/knowledge/manual', () => ({ createManualKnowledgeItemWithOptionalDocument: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockCreate = jest.mocked(createManualKnowledgeItemWithOptionalDocument)
const mockTrackEvent = jest.mocked(trackEvent)

function jsonRequest(source: string, body: unknown) {
  return POST(new Request(`http://localhost/api/integrations/${source}/knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ source }) })
}

function multipartRequest(source: string, fields: Record<string, string>, file?: File) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  if (file) form.append('file', file)
  return POST(new Request(`http://localhost/api/integrations/${source}/knowledge`, {
    method: 'POST',
    body: form,
  }), { params: Promise.resolve({ source }) })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({
    workspaceId: 'workspace-1',
    member: { role: 'member', status: 'active', displayName: 'Ali' },
  } as never)
  mockCreate.mockResolvedValue({
    knowledgeItem: {
      id: 'item-1',
      content: 'Title\n\nBody',
      category: 'fact',
      source: 'datatruck',
      sourceExternalId: 'manual:datatruck:uuid',
      createdAt: '2026-07-08T00:00:00.000Z',
    },
    documentAttachment: null,
  })
})

it('returns 401 when unauthenticated', async () => {
  mockAuth.mockResolvedValue({ userId: null } as never)

  const res = await jsonRequest('slack', { title: 'T', description: 'D' })

  expect(res.status).toBe(401)
  expect(mockCreate).not.toHaveBeenCalled()
})

it('rejects users outside the workspace', async () => {
  mockRequireWorkspaceMember.mockResolvedValue({ error: 'Forbidden', status: 403 } as never)

  const res = await jsonRequest('slack', { title: 'T', description: 'D' })

  expect(res.status).toBe(403)
})

it('rejects unsupported sources', async () => {
  const res = await jsonRequest('nonsense', { title: 'T', description: 'D' })

  expect(res.status).toBe(400)
  expect((await res.json()).error).toBe('Unsupported integration')
})

it('rejects an empty title', async () => {
  const res = await jsonRequest('slack', { title: '  ', description: 'D' })

  expect(res.status).toBe(400)
  expect((await res.json()).error).toContain('Title is required')
})

it('rejects an empty description', async () => {
  const res = await jsonRequest('slack', { title: 'T', description: '' })

  expect(res.status).toBe(400)
  expect((await res.json()).error).toContain('Description is required')
})

it('rejects an unknown category', async () => {
  const res = await jsonRequest('slack', { title: 'T', description: 'D', category: 'nonsense' })

  expect(res.status).toBe(400)
})

it('creates knowledge from a JSON body', async () => {
  const res = await jsonRequest('slack', { title: 'Escalation rule', description: 'Ping #ops first.', category: 'rule' })

  expect(res.status).toBe(200)
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    workspaceId: 'workspace-1',
    source: 'slack',
    title: 'Escalation rule',
    description: 'Ping #ops first.',
    category: 'rule',
    createdByUserId: 'user-1',
    createdByName: 'Ali',
    file: null,
  }))
  expect(mockTrackEvent).toHaveBeenCalledWith(
    'workspace-1', 'user-1', 'Ali', 'verify',
    'Ali added knowledge to Slack',
    expect.objectContaining({ integration: 'slack', manual: true, sourceUrl: '/dashboard/integrations/slack' }),
  )
  expect((await res.json()).success).toBe(true)
})

it('creates Datatruck knowledge with load and document type from multipart, including a file', async () => {
  const res = await multipartRequest(
    'datatruck',
    { title: 'BOL rule', description: 'Body', category: 'rule', externalLoadId: '12345', documentType: 'BOL' },
    new File(['content'], 'bol.txt', { type: 'text/plain' }),
  )

  expect(res.status).toBe(200)
  const args = mockCreate.mock.calls[0][0]
  expect(args.externalLoadId).toBe('12345')
  expect(args.documentType).toBe('BOL')
  expect(args.file?.fileName).toBe('bol.txt')
  expect(Buffer.isBuffer(args.file?.buffer)).toBe(true)
})

it('rejects unsupported file types', async () => {
  const res = await multipartRequest(
    'slack',
    { title: 'T', description: 'D' },
    new File(['x'], 'virus.exe', { type: 'application/octet-stream' }),
  )

  expect(res.status).toBe(400)
  expect(mockCreate).not.toHaveBeenCalled()
})

it('never exposes local file paths in the response', async () => {
  mockCreate.mockResolvedValue({
    knowledgeItem: {
      id: 'item-1', content: 'x', category: 'fact', source: 'datatruck',
      sourceExternalId: 'manual:datatruck:uuid', createdAt: '2026-07-08T00:00:00.000Z',
    },
    documentAttachment: {
      id: 'doc-1', fileName: 'bol.txt', documentType: 'BOL', externalLoadId: '12345',
      extractionStatus: 'extracted', storageUrl: '/api/documents/doc-1', createdAt: '2026-07-08T00:00:00.000Z',
    },
  })

  const res = await jsonRequest('datatruck', { title: 'T', description: 'D' })

  const body = JSON.stringify(await res.json())
  expect(body).not.toContain('storageKey')
  expect(body).not.toContain(process.cwd())
  expect(body).toContain('/api/documents/doc-1')
})
