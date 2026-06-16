/** @jest-environment node */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { syncLinearIssues } from '@/lib/linear/sync'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    syncStatus: { upsert: jest.fn() },
    integration: { update: jest.fn() },
  },
}))
jest.mock('@/lib/linear/sync', () => ({ syncLinearIssues: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const result = {
  success: true, synced: 6, imported: 6, updated: 0, skipped: 0, deleted: 0, extracted: 6,
  issuesFound: 6, teamsScanned: 2, teams: [], organization: { id: 'org-1', name: 'DeepTracer' },
  viewer: { id: 'viewer-1', name: 'Ali' }, skippedReasons: {},
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as unknown as jest.Mock).mockResolvedValue({ userId: 'user-1' })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
    workspace: { id: 'ws-1', integrations: [{ id: 'int-1', accessToken: 'enc', lastSyncAt: null, metadata: null }] },
  })
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ role: 'member', displayName: 'Ali' })
  ;(prisma.syncStatus.upsert as jest.Mock).mockResolvedValue({})
  ;(syncLinearIssues as jest.Mock).mockResolvedValue(result)
})

it('returns useful Linear issue and team counts', async () => {
  const res = await POST()
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({
    success: true, imported: 6, updated: 0, skipped: 0, deleted: 0,
    extracted: 6, teamsScanned: 2, issuesFound: 6,
  })
})

it('returns a useful error response when Linear fails', async () => {
  ;(syncLinearIssues as jest.Mock).mockRejectedValue(new Error('Linear GraphQL error: Insufficient scope'))
  const res = await POST()
  expect(res.status).toBe(502)
  expect(await res.json()).toMatchObject({
    success: false, issuesFound: 0, teamsScanned: 0,
    error: 'Linear API query failed — Linear GraphQL error: Insufficient scope',
  })
})
