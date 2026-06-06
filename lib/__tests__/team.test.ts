/**
 * @jest-environment node
 */
import { canInvite, canManageMembers, canSync, canLabel, getMemberRole, assertRole } from '../team'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: { workspaceMember: { findUnique: jest.fn() } },
}))

const mockFindUnique = jest.mocked(prisma.workspaceMember.findUnique)

function member(role: string, status = 'active') {
  return { role, status }
}

describe('role permission helpers', () => {
  it('owner can invite', () => expect(canInvite('owner')).toBe(true))
  it('admin can invite', () => expect(canInvite('admin')).toBe(true))
  it('member cannot invite', () => expect(canInvite('member')).toBe(false))
  it('viewer cannot invite', () => expect(canInvite('viewer')).toBe(false))

  it('owner can manage members', () => expect(canManageMembers('owner')).toBe(true))
  it('admin can manage members', () => expect(canManageMembers('admin')).toBe(true))
  it('member cannot manage members', () => expect(canManageMembers('member')).toBe(false))

  it('owner can sync', () => expect(canSync('owner')).toBe(true))
  it('member can sync', () => expect(canSync('member')).toBe(true))
  it('viewer cannot sync', () => expect(canSync('viewer')).toBe(false))

  it('owner can label', () => expect(canLabel('owner')).toBe(true))
  it('member can label', () => expect(canLabel('member')).toBe(true))
  it('viewer cannot label', () => expect(canLabel('viewer')).toBe(false))
})

describe('getMemberRole', () => {
  it('returns role for active member', async () => {
    mockFindUnique.mockResolvedValueOnce(member('admin') as never)
    const role = await getMemberRole('ws-1', 'user-1')
    expect(role).toBe('admin')
  })

  it('returns null for removed member', async () => {
    mockFindUnique.mockResolvedValueOnce(member('member', 'removed') as never)
    const role = await getMemberRole('ws-1', 'user-1')
    expect(role).toBeNull()
  })

  it('returns null when no record found', async () => {
    mockFindUnique.mockResolvedValueOnce(null as never)
    const role = await getMemberRole('ws-1', 'user-1')
    expect(role).toBeNull()
  })
})

describe('assertRole', () => {
  it('returns role when permission passes', async () => {
    mockFindUnique.mockResolvedValueOnce(member('owner') as never)
    const role = await assertRole('ws-1', 'user-1', canInvite)
    expect(role).toBe('owner')
  })

  it('throws when member lacks permission', async () => {
    mockFindUnique.mockResolvedValueOnce(member('viewer') as never)
    await expect(assertRole('ws-1', 'user-1', canInvite)).rejects.toThrow('Forbidden')
  })

  it('throws when member not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null as never)
    await expect(assertRole('ws-1', 'user-1', canInvite)).rejects.toThrow('Forbidden')
  })
})
