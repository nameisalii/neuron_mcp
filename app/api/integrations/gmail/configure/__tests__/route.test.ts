/** @jest-environment node */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { getAccessToken, estimateMessageCount } from '@/lib/gmail/api'
import { decrypt } from '@/lib/crypto'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    integration: { findUnique: jest.fn(), update: jest.fn() },
    syncStatus: { upsert: jest.fn() },
  },
}))
jest.mock('@/lib/gmail/api', () => ({
  getAccessToken: jest.fn(),
  estimateMessageCount: jest.fn(),
}))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockIntegrationFind = jest.mocked(prisma.integration.findUnique)
const mockIntegrationUpdate = jest.mocked(prisma.integration.update)
const mockSyncStatusUpsert = jest.mocked(prisma.syncStatus.upsert)
const mockGetAccessToken = jest.mocked(getAccessToken)
const mockEstimate = jest.mocked(estimateMessageCount)
const mockDecrypt = jest.mocked(decrypt)

function request(body: unknown) {
  return new Request('http://localhost/api/integrations/gmail/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  mockMemberFind.mockResolvedValue({ role: 'member', status: 'active', displayName: 'Ali' } as never)
  mockIntegrationFind.mockResolvedValue({ accessToken: 'encrypted', metadata: null } as never)
  mockIntegrationUpdate.mockResolvedValue({} as never)
  mockSyncStatusUpsert.mockResolvedValue({} as never)
  mockGetAccessToken.mockResolvedValue('access-token')
  mockEstimate.mockResolvedValue(10)
  mockDecrypt.mockReturnValue('refresh-token')
})

it('saves selected labels and configuration', async () => {
  const res = await POST(request({
    selectedLabels: ['INBOX', 'STARRED'],
    selectedLabelNames: ['Inbox', 'Starred'],
    syncFrom: '2026-06-01T00:00:00.000Z',
    senderFilter: ['boss@company.com'],
    excludeFilter: ['promo@company.com'],
    maxMessages: 150,
  }))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)
  expect(body.selectedLabels).toEqual(['INBOX', 'STARRED'])
  expect(mockIntegrationUpdate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      metadata: expect.objectContaining({
        configured: true,
        privacy: 'personal',
        selectedLabels: ['INBOX', 'STARRED'],
        syncFrom: '2026-06-01T00:00:00.000Z',
      }),
    }),
  }))
})

it('rejects unsafe empty label configuration', async () => {
  const res = await POST(request({ selectedLabels: [] }))
  expect(res.status).toBe(400)
})

