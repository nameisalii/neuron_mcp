'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { Brain, Lightbulb, GitBranch, Search, Plug, Menu, X, FileText, Settings, Activity } from 'lucide-react'
import { useState } from 'react'
import { clsx } from 'clsx'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import UpgradeModal from '@/components/UpgradeModal'

interface NavCounts {
  brain: number
  decisions: number
  ideas: number
}

type CountKey = keyof NavCounts

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  exact?: boolean
  countKey?: CountKey
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: Brain, exact: true },
  { href: '/dashboard/brain', label: 'Brain', icon: Brain, countKey: 'brain' },
  { href: '/dashboard/notion', label: 'Notion', icon: FileText },
  { href: '/dashboard/decisions', label: 'Decisions', icon: GitBranch, countKey: 'decisions' },
  { href: '/dashboard/ideas', label: 'Ideas', icon: Lightbulb, countKey: 'ideas' },
  { href: '/dashboard/query', label: 'Query', icon: Search },
  { href: '/dashboard/activity', label: 'Activity', icon: Activity },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug },
  { href: '/dashboard/settings/capture', label: 'Capture', icon: Settings },
]

interface NavLinkProps extends NavItem {
  count?: number
}

function NavLink({ href, label, icon: Icon, exact, count }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      className={clsx(
        'flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        isActive
          ? 'bg-brand-50 text-brand-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      )}
    >
      <span className="flex items-center gap-3">
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center',
            isActive ? 'bg-brand-200 text-brand-800' : 'bg-gray-100 text-gray-500'
          )}
        >
          {count > 999 ? '999+' : count}
        </span>
      )}
    </Link>
  )
}

export default function DashboardShell({
  children,
  counts,
  workspaceId,
}: {
  children: React.ReactNode
  counts: NavCounts
  workspaceId?: string
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-60 bg-white border-r border-gray-200 flex flex-col',
          'transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-2 px-4 h-16 border-b border-gray-200 shrink-0">
          <div className="w-7 h-7 rounded-md bg-brand-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900">Neuron</span>
        </div>

        {workspaceId && (
          <>
            <div className="border-b border-gray-100">
              <WorkspaceSwitcher
                currentWorkspaceId={workspaceId}
                onUpgradeClick={() => setShowUpgrade(true)}
              />
            </div>
            <UpgradeModal
              isOpen={showUpgrade}
              onClose={() => setShowUpgrade(false)}
              onUpgradeComplete={() => setShowUpgrade(false)}
            />
          </>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              count={item.countKey ? counts[item.countKey] : undefined}
            />
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <button
            className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1" />
          <UserButton />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
