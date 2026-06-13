/** @jest-environment node */
import { runLinearBackgroundSync } from '../background'
import { prisma } from '@/lib/db'
import { syncLinearIssues } from '../sync'

jest.mock('@/lib/db', () => ({
  prisma: {
    integration: { findUnique: jest.fn() },
    syncStatus: { findUnique: jest.fn(), upsert: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
  },
}))
jest.mock('../sync', () => ({ syncLinearIssues: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn() }))

const integration = { id: 'int-1', workspaceId: 'ws-1', accessToken: 'enc', lastSyncAt: null, metadata: null }
const result = { synced: 1, extracted: 2, imported: 1, updated: 0, skipped: 0, deleted: 0 }

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue(integration)
  ;(prisma.syncStatus.findUnique as jest.Mock).mockResolvedValue({ configuredBy: 'user-1', status: 'active' })
  ;(prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({ displayName: 'Ali', status: 'active' })
  ;(prisma.syncStatus.upsert as jest.Mock).mockResolvedValue({})
  ;(syncLinearIssues as jest.Mock).mockResolvedValue(result)
})

it('runs incremental Linear sync and schedules the next run', async () => {
  expect(await runLinearBackgroundSync('ws-1')).toEqual(result)
  expect(syncLinearIssues).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1' }))
  expect(prisma.syncStatus.upsert).toHaveBeenCalledWith(expect.objectContaining({
    update: expect.objectContaining({ nextSyncAt: expect.any(Date), status: 'active' }),
  }))
})

it('respects the integration cooldown', async () => {
  ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue({ ...integration, lastSyncAt: new Date() })
  await runLinearBackgroundSync('ws-1')
  expect(syncLinearIssues).not.toHaveBeenCalled()
})

it('does not run paused syncs', async () => {
  ;(prisma.syncStatus.findUnique as jest.Mock).mockResolvedValue({ configuredBy: 'user-1', status: 'paused' })
  await runLinearBackgroundSync('ws-1')
  expect(syncLinearIssues).not.toHaveBeenCalled()
})
