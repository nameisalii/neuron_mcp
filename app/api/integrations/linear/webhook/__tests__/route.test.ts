/** @jest-environment node */
import { createHmac } from 'crypto'
import { POST } from '../route'
import { prisma } from '@/lib/db'
import { deleteLinearIssue, syncLinearIssueById } from '@/lib/linear/sync'

jest.mock('@/lib/db', () => ({
  prisma: {
    integration: { findFirst: jest.fn() },
    syncStatus: { updateMany: jest.fn() },
  },
}))
jest.mock('@/lib/linear/sync', () => ({ deleteLinearIssue: jest.fn(), syncLinearIssueById: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const secret = 'linear-secret'
const integration = { id: 'int-1', workspaceId: 'ws-1', accessToken: 'encrypted', lastSyncAt: null, metadata: null }

function request(body: object, signature?: string) {
  const raw = JSON.stringify(body)
  return new Request('http://localhost/api/integrations/linear/webhook', {
    method: 'POST',
    headers: { 'linear-signature': signature ?? createHmac('sha256', secret).update(raw).digest('hex') },
    body: raw,
  }) as never
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.LINEAR_WEBHOOK_SECRET = secret
  ;(prisma.integration.findFirst as jest.Mock).mockResolvedValue(integration)
  ;(deleteLinearIssue as jest.Mock).mockResolvedValue(1)
  ;(syncLinearIssueById as jest.Mock).mockResolvedValue({ updated: 1 })
})

it('rejects invalid signatures', async () => {
  expect((await POST(request({ type: 'Issue' }, 'bad'))).status).toBe(401)
})

it('syncs created and updated issues', async () => {
  const res = await POST(request({ type: 'Issue', action: 'update', organizationId: 'org-1', data: { id: 'issue-1' } }))
  expect(res.status).toBe(200)
  expect(syncLinearIssueById).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1' }), 'issue-1')
})

it('deletes removed issues from search storage', async () => {
  await POST(request({ type: 'Issue', action: 'remove', organizationId: 'org-1', data: { id: 'issue-1', url: 'https://linear.app/issue/1' } }))
  expect(deleteLinearIssue).toHaveBeenCalledWith('ws-1', 'issue-1', 'https://linear.app/issue/1')
})

it('resyncs the parent issue for comment events', async () => {
  await POST(request({ type: 'Comment', action: 'create', organizationId: 'org-1', data: { id: 'comment-1', issue: { id: 'issue-1' } } }))
  expect(syncLinearIssueById).toHaveBeenCalledWith(expect.anything(), 'issue-1')
})
