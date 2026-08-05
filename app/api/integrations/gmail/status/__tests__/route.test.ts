/** @jest-environment node */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { GET } from '../route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    integration: { findUnique: jest.fn() },
    emailThread: { count: jest.fn() },
  },
}))

it('returns safe Gmail status without tokens or secrets', async () => {
  jest.mocked(auth).mockResolvedValue({ userId: 'user-1' } as never)
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  jest.mocked(prisma.integration.findUnique).mockResolvedValue({
    createdAt: new Date('2026-08-01T00:00:00Z'),
    lastSyncAt: null,
    metadata: { selectedLabels: ['INBOX'] },
  } as never)
  jest.mocked(prisma.emailThread.count).mockResolvedValue(3)

  const response = await GET()
  const serialized = JSON.stringify(await response.json())
  expect(serialized).toContain('importedThreads')
  expect(serialized).not.toMatch(/accessToken|refreshToken|clientSecret|GMAIL_CLIENT_SECRET/i)
})
