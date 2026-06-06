'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crown, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clsx } from 'clsx'
import type { MemberRole } from '@/types'

interface Member {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'viewer'
  joinedAt: string
  department: string | null
}

interface PendingInvite {
  id: string
  email: string
  role: 'admin' | 'member' | 'viewer'
  expiresAt: string
}

interface Props {
  workspaceId: string
  workspaceName: string | null
  currentUserId: string
  currentRole: MemberRole
  members: Member[]
  invitations: PendingInvite[]
  canManage: boolean
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-700',
  viewer: 'bg-amber-100 text-amber-700',
}

export default function TeamPageClient({
  workspaceId,
  workspaceName,
  currentUserId,
  currentRole,
  members: initialMembers,
  invitations: initialInvitations,
  canManage,
}: Props) {
  const router = useRouter()
  const [members, setMembers] = useState(initialMembers)
  const [invitations, setInvitations] = useState(initialInvitations)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [inviting, setInviting] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  async function sendInvite() {
    if (!inviteEmails.trim()) return
    setInviting(true)
    try {
      await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: inviteEmails, role: inviteRole }),
      })
      setInviteEmails('')
      setShowInviteModal(false)
      router.refresh()
    } finally {
      setInviting(false)
    }
  }

  async function changeRole(memberId: string, role: 'admin' | 'member' | 'viewer') {
    await fetch(`/api/team/members/${memberId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)))
    setOpenMenu(null)
  }

  async function removeMember(memberId: string) {
    if (!confirm('Remove this member from the workspace?')) return
    await fetch(`/api/team/members/${memberId}`, { method: 'DELETE' })
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
    setOpenMenu(null)
  }

  async function revokeInvite(inviteId: string) {
    await fetch(`/api/team/invitations/${inviteId}`, { method: 'DELETE' })
    setInvitations((prev) => prev.filter((i) => i.id !== inviteId))
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
          <p className="text-sm text-gray-500 mt-1">{workspaceName ?? 'Your workspace'}</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowInviteModal(true)}>Invite</Button>
        )}
      </div>

      {/* Members list */}
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {members.map((m) => (
          <div
            key={m.id}
            className={clsx(
              'flex items-center gap-3 px-4 py-3',
              m.userId === currentUserId && 'bg-blue-50/40',
            )}
          >
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-xs font-semibold text-gray-600">
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt={m.displayName} className="w-full h-full object-cover" />
              ) : (
                m.displayName[0]?.toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-900 truncate">{m.displayName}</span>
                {m.userId === currentUserId && (
                  <span className="text-xs text-gray-400">(you)</span>
                )}
                {m.role === 'owner' && <Crown className="w-3 h-3 text-amber-500 shrink-0" />}
              </div>
              {m.department && <p className="text-xs text-gray-400">{m.department}</p>}
            </div>
            <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full shrink-0', ROLE_COLORS[m.role])}>
              {m.role}
            </span>
            {canManage && m.role !== 'owner' && m.userId !== currentUserId && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {openMenu === m.id && (
                  <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg z-10 w-40 py-1">
                    {(['admin', 'member', 'viewer'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => changeRole(m.id, r)}
                        className={clsx(
                          'w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50',
                          m.role === r ? 'text-blue-600 font-semibold' : 'text-gray-700',
                        )}
                      >
                        Set as {r}
                      </button>
                    ))}
                    <hr className="my-1 border-gray-100" />
                    <button
                      onClick={() => removeMember(m.id)}
                      className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      Remove from team
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Pending Invitations</h2>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{inv.email}</p>
                  <p className="text-xs text-gray-400">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full shrink-0', ROLE_COLORS[inv.role])}>
                  {inv.role}
                </span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">pending</span>
                {canManage && (
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    className="text-xs text-gray-400 hover:text-red-600 transition-colors shrink-0"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Invite people</h2>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email addresses (comma-separated)
            </label>
            <textarea
              autoFocus
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              placeholder="ali@example.com, sara@example.com"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 mb-3"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="admin">Admin — can invite and manage integrations</option>
              <option value="member">Member — can sync, label, and query</option>
              <option value="viewer">Viewer — can query only</option>
            </select>
            <div className="flex gap-2">
              <Button onClick={sendInvite} disabled={inviting || !inviteEmails.trim()} className="flex-1 justify-center">
                {inviting ? 'Sending…' : 'Send invite'}
              </Button>
              <Button variant="secondary" onClick={() => setShowInviteModal(false)} className="flex-1 justify-center">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
