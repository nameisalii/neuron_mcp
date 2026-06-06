'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Users, User, Plus } from 'lucide-react'
import { clsx } from 'clsx'

interface WorkspaceItem {
  id: string
  name: string
  type: 'solo' | 'team'
  iconUrl: string | null
  role: string
  isOwner: boolean
  memberCount: number
}

interface WorkspaceSwitcherProps {
  currentWorkspaceId: string
  onUpgradeClick: () => void
}

export default function WorkspaceSwitcher({ currentWorkspaceId, onUpgradeClick }: WorkspaceSwitcherProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/workspace/list')
      .then((r) => r.json() as Promise<{ workspaces: WorkspaceItem[] }>)
      .then((d) => setWorkspaces(d.workspaces ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const current = workspaces.find((w) => w.id === currentWorkspaceId)
  const isSolo = !current || current.type === 'solo'

  if (loading) {
    return (
      <div className="px-3 py-2">
        <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <div ref={dropdownRef} className="relative px-3 py-2">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-md bg-brand-100 flex items-center justify-center shrink-0">
          {isSolo ? (
            <User className="w-3.5 h-3.5 text-brand-600" />
          ) : (
            <Users className="w-3.5 h-3.5 text-brand-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {current?.name ?? 'My Brain'}
          </p>
          <p className="text-xs text-gray-400">
            {isSolo ? 'Personal' : `${current?.memberCount ?? 1} members`}
          </p>
        </div>
        <ChevronDown
          className={clsx('w-4 h-4 text-gray-400 shrink-0 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
          {workspaces.length > 0 && (
            <div className="py-1">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-2.5 text-sm',
                    ws.id === currentWorkspaceId
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-700 hover:bg-gray-50 cursor-pointer',
                  )}
                  onClick={() => {
                    if (ws.id !== currentWorkspaceId) window.location.reload()
                    setIsOpen(false)
                  }}
                >
                  <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center shrink-0 text-xs font-semibold text-gray-600">
                    {ws.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{ws.name}</p>
                    <p className="text-xs text-gray-400">
                      {ws.type === 'solo' ? 'Personal' : `${ws.memberCount} members`}
                      {' · '}{ws.role}
                    </p>
                  </div>
                  {ws.id === currentWorkspaceId && (
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}

          {isSolo && (
            <div className="border-t border-gray-100 py-1">
              <button
                onClick={() => { setIsOpen(false); onUpgradeClick() }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-brand-600 hover:bg-brand-50 transition-colors"
              >
                <div className="w-6 h-6 rounded bg-brand-50 flex items-center justify-center shrink-0">
                  <Plus className="w-3.5 h-3.5 text-brand-600" />
                </div>
                <span className="font-medium">Add team members</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
