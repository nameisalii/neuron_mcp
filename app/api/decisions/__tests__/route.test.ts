/** @jest-environment node */
import { POST } from '../route'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { trackValidationEvent } from '@/lib/activity'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ prisma: { user: { findUnique: jest.fn() }, workspaceMember: { findUnique: jest.fn() }, decision: { create: jest.fn() } } }))
jest.mock('@/lib/activity', () => ({ trackValidationEvent: jest.fn().mockResolvedValue({ ok: true, eventId: 'event-1' }) }))

it('creates a workspace-scoped manual decision', async () => {
  jest.mocked(auth).mockResolvedValue({ userId: 'user-1' } as never)
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ workspace: { id: 'ws-1' } } as never)
  jest.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({ displayName: 'Ali' } as never)
  jest.mocked(prisma.decision.create).mockResolvedValue({ id: 'decision-1', source: 'manual' } as never)
  const response = await POST(new Request('http://localhost/api/decisions', { method: 'POST', body: JSON.stringify({ title: 'Delay launch', summary: 'Delay launch until verification is complete.', reason: 'Approval pending', impact: 'Gmail remains upcoming' }) }))
  expect(response.status).toBe(201)
  expect(prisma.decision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ workspaceId: 'ws-1', title: 'Delay launch', source: 'manual' }) })
  expect(trackValidationEvent).toHaveBeenCalledWith('ws-1', 'user-1', 'Ali', 'save_decision', 'Ali saved a decision', expect.objectContaining({ decisionId: 'decision-1' }))
})

it('requires authentication', async () => {
  jest.mocked(auth).mockResolvedValue({ userId: null } as never)
  expect((await POST(new Request('http://localhost/api/decisions', { method: 'POST', body: '{}' }))).status).toBe(401)
})
