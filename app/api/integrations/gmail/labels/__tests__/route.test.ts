/** @jest-environment node */
import { GET } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { getAccessToken, listLabels, getLabelDetail } from '@/lib/gmail/api'
import { decrypt } from '@/lib/crypto'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    integration: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/gmail/api', () => ({
  getAccessToken: jest.fn(),
  listLabels: jest.fn(),
  getLabelDetail: jest.fn(),
}))
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn() }))

const mockAuth = jest.mocked(auth)
const mockUserFind = jest.mocked(prisma.user.findUnique)
const mockMemberFind = jest.mocked(prisma.workspaceMember.findUnique)
const mockIntegrationFind = jest.mocked(prisma.integration.findUnique)
const mockGetAccessToken = jest.mocked(getAccessToken)
const mockListLabels = jest.mocked(listLabels)
const mockGetLabelDetail = jest.mocked(getLabelDetail)
const mockDecrypt = jest.mocked(decrypt)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user-1' } as never)
  mockUserFind.mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  mockMemberFind.mockResolvedValue({ role: 'member', status: 'active' } as never)
  mockIntegrationFind.mockResolvedValue({ accessToken: 'encrypted', metadata: { configured: true, selectedLabels: ['INBOX'] } } as never)
  mockGetAccessToken.mockResolvedValue('access-token')
  mockListLabels.mockResolvedValue([
    { id: 'INBOX', name: 'Inbox', type: 'system', messagesTotal: 10 },
    { id: 'STARRED', name: 'Starred', type: 'system', messagesTotal: 3 },
  ])
  mockGetLabelDetail.mockImplementation(async (accessToken, labelId) => ({
    id: labelId,
    name: labelId === 'INBOX' ? 'Inbox' : 'Starred',
    type: 'system',
    messagesTotal: labelId === 'INBOX' ? 10 : 3,
    messagesUnread: labelId === 'INBOX' ? 2 : 1,
  }))
  mockDecrypt.mockReturnValue('refresh-token')
})

it('returns Gmail labels with counts', async () => {
  const res = await GET()
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.labels).toHaveLength(2)
  expect(body.configured).toBe(true)
  expect(body.selectedLabels).toEqual(['INBOX'])
})

it('fails when Gmail is disconnected', async () => {
  mockIntegrationFind.mockResolvedValue(null as never)
  const res = await GET()
  expect(res.status).toBe(404)
})

it('fails when token refresh fails', async () => {
  mockGetAccessToken.mockRejectedValue(new Error('token refresh failed'))
  const res = await GET()
  expect(res.status).toBe(422)
})
