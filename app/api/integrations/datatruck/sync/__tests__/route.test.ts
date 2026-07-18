/**
 * @jest-environment node
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { decrypt } from '@/lib/crypto'
import { syncDatatruckKnowledge } from '@/lib/datatruck/sync'
import { POST } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn() }))
jest.mock('@/lib/activity', () => ({ trackEvent: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/datatruck/sync', () => ({ syncDatatruckKnowledge: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    apiConnector: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

const mockAuth = jest.mocked(auth)
const mockRequireWorkspaceMember = jest.mocked(requireWorkspaceMember)
const mockDecrypt = jest.mocked(decrypt)
const mockSync = jest.mocked(syncDatatruckKnowledge)
const mockFindUnique = jest.mocked(prisma.apiConnector.findUnique)
const mockUpdate = jest.mocked(prisma.apiConnector.update)

const connector = {
  id: 'connector-1',
  apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi',
  encryptedCredential: 'ciphertext',
  metadata: { companyName: 'sflogistics', endpointMapping: { invoices: '/confirmed/path/' } },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockRequireWorkspaceMember.mockResolvedValue({
    workspaceId: 'workspace-1',
    member: { role: 'admin', status: 'active', displayName: 'Ali' },
  } as never)
  mockDecrypt.mockReturnValue('decrypted-token')
  mockUpdate.mockResolvedValue({} as never)
  mockSync.mockResolvedValue({
    ok: true,
    fetched: 12,
    created: 10,
    updated: 2,
    skipped: 0,
    embeddingErrors: 0,
    failedEndpoints: [],
    endpoints: {
      loads: {
        endpointKey: 'loads',
        label: 'Loads',
        path: '/orders/',
        configuredBy: 'default',
        status: 'synced',
        fetched: 4,
        created: 4,
        updated: 0,
        skipped: 0,
        pagesFetched: 1,
        countFromApi: 4,
        nextStoppedReason: 'complete',
        error: null,
      },
      dispatcherBoard: {
        endpointKey: 'dispatcherBoard',
        label: 'Dispatcher board',
        path: '/orders/dispatcher-board/list/',
        configuredBy: 'default',
        status: 'synced',
        fetched: 2,
        created: 2,
        updated: 0,
        skipped: 0,
        pagesFetched: 1,
        countFromApi: 2,
        nextStoppedReason: 'complete',
        error: null,
      },
      drivers: {
        endpointKey: 'drivers',
        label: 'Drivers',
        path: '/drivers/list/',
        configuredBy: 'default',
        status: 'synced',
        fetched: 2,
        created: 2,
        updated: 0,
        skipped: 0,
        pagesFetched: 1,
        countFromApi: 2,
        nextStoppedReason: 'complete',
        error: null,
      },
      trucks: {
        endpointKey: 'trucks',
        label: 'Trucks',
        path: '/trucks/list/',
        configuredBy: 'default',
        status: 'synced',
        fetched: 2,
        created: 1,
        updated: 1,
        skipped: 0,
        pagesFetched: 1,
        countFromApi: 2,
        nextStoppedReason: 'complete',
        error: null,
      },
      trailers: {
        endpointKey: 'trailers',
        label: 'Trailers',
        path: '/trailers/list/',
        configuredBy: 'default',
        status: 'synced',
        fetched: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        pagesFetched: 1,
        countFromApi: 1,
        nextStoppedReason: 'complete',
        error: null,
      },
      workOrders: {
        endpointKey: 'workOrders',
        label: 'Work orders',
        path: '/work-orders/',
        configuredBy: 'default',
        status: 'synced',
        fetched: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        pagesFetched: 1,
        countFromApi: 1,
        nextStoppedReason: 'complete',
        error: null,
      },
    } as never,
    totalFetched: 12,
    totalCreated: 10,
    totalUpdated: 2,
    totalSkipped: 0,
    warnings: [],
    hasMore: false,
    loadTotals: { count: 12, pay: 100, byStatus: {} },
    message: 'Datatruck sync complete.',
  })
})

it('returns 401 when unauthenticated', async () => {
  mockAuth.mockResolvedValue({ userId: null } as never)

  const res = await POST()

  expect(res.status).toBe(401)
})

it('returns "Datatruck is not connected." when no connector exists', async () => {
  mockFindUnique.mockResolvedValue(null as never)

  const res = await POST()

  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ success: false, error: 'Datatruck is not connected.' })
  expect(mockSync).not.toHaveBeenCalled()
})

it('syncs knowledge using the stored connector credentials and saved cursors', async () => {
  mockFindUnique.mockResolvedValue(connector as never)

  const res = await POST()

  expect(mockDecrypt).toHaveBeenCalledWith('ciphertext')
  expect(mockSync).toHaveBeenCalledWith(
    'workspace-1',
      {
        apiBaseUrl: 'https://sflogistics.datatruck.io/api/v1/openapi',
        apiToken: 'decrypted-token',
      },
      {},
      undefined,
      { companyName: 'sflogistics', endpointMapping: { invoices: '/confirmed/path/' } },
    )
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'connector-1' },
    data: expect.objectContaining({
      status: 'connected',
      lastSyncAt: expect.any(Date),
      metadata: expect.objectContaining({
          companyName: 'sflogistics',
          endpointMapping: { invoices: '/confirmed/path/' },
          lastSyncSummary: expect.objectContaining({
          fetched: 12,
          created: 10,
          updated: 2,
          warnings: [],
        }),
      }),
    }),
  }))
  const json = await res.json()
  expect(json.success).toBe(true)
  expect(json.synced).toBe(12)
  expect(json.hasMore).toBe(false)
  expect(json.message).toBe('Datatruck sync complete.')
  expect(JSON.stringify(json)).not.toContain('decrypted-token')
})

it('tells the user to sync again when the request budget ran out mid-import', async () => {
  mockFindUnique.mockResolvedValue(connector as never)
  mockSync.mockResolvedValue({
    ok: true,
    fetched: 130,
    created: 100,
    updated: 0,
    skipped: 30,
    embeddingErrors: 0,
    failedEndpoints: [],
    endpoints: {} as never,
    totalFetched: 130,
    totalCreated: 100,
    totalUpdated: 0,
    totalSkipped: 30,
    warnings: [],
    hasMore: true,
    loadTotals: { count: 130, pay: 90000, byStatus: { delivered: { count: 130, pay: 90000 } } },
    message: 'Datatruck sync complete.',
  })

  const res = await POST()

  const json = await res.json()
  expect(json.hasMore).toBe(true)
  expect(json.message).toBe('Datatruck sync complete.')
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      metadata: expect.objectContaining({
        lastSyncSummary: expect.objectContaining({
          warnings: [],
        }),
      }),
    }),
  }))
})

it('marks the connector as sync_error with a concise message when the sync fails', async () => {
  mockFindUnique.mockResolvedValue(connector as never)
  mockSync.mockResolvedValue({
    ok: false,
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    embeddingErrors: 0,
    failedEndpoints: ['loads'],
    endpoints: {} as never,
    totalFetched: 0,
    totalCreated: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    warnings: ['Datatruck loads failed.'],
    hasMore: false,
    loadTotals: { count: 0, pay: 0, byStatus: {} },
    message: 'Datatruck sync completed with some warnings.',
  })

  const res = await POST()

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual(expect.objectContaining({
    success: false,
    message: 'Datatruck sync completed with some warnings.',
  }))
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'sync_error' }),
  }))
})

it('asks the user to reconnect when the stored credential cannot be decrypted', async () => {
  mockFindUnique.mockResolvedValue(connector as never)
  mockDecrypt.mockImplementation(() => {
    throw new Error('bad key')
  })

  const res = await POST()

  expect(res.status).toBe(422)
  expect((await res.json()).error).toContain('reconnect Datatruck')
  expect(mockSync).not.toHaveBeenCalled()
})
