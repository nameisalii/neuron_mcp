/** @jest-environment node */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceMember } from '@/lib/api/workspace-auth'
import { DELETE } from '../route'
jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/workspace-auth', () => ({ requireWorkspaceMember: jest.fn() }))
jest.mock('@/lib/db', () => ({ prisma: { apiConnector: { updateMany: jest.fn() } } }))
it('clears credentials only for the authenticated workspace', async () => {
  jest.mocked(auth).mockResolvedValue({ userId: 'u1' } as never); jest.mocked(requireWorkspaceMember).mockResolvedValue({ workspaceId: 'ws-1' } as never)
  const response = await DELETE(); expect(response.status).toBe(200)
  expect(prisma.apiConnector.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'ws-1', sourceKey: 'five_eld' }, data: expect.objectContaining({ encryptedCredential: null, status: 'disconnected' }) }))
})
