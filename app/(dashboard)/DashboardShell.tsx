'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { Brain, Search, Plug, Menu, X, Settings, Activity, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { clsx } from 'clsx'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import UpgradeModal from '@/components/UpgradeModal'
import NeuronLogo from '@/components/NeuronLogo'

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
  { href: '/dashboard/overview', label: 'Overview', icon: Brain },
  { href: '/dashboard/query', label: 'Query', icon: Search },
  { href: '/dashboard/activity', label: 'Activity', icon: Activity },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug },
  { href: '/dashboard/settings/capture', label: 'Capture', icon: Settings },
  { href: '/dashboard/feedback', label: 'Feedback', icon: MessageSquare },
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
        'group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-colors',
        isActive
          ? 'bg-white/10 text-white'
          : 'text-white/65 hover:bg-white/[0.07] hover:text-white'
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-accent" />
      )}
      <span className="flex items-center gap-3">
        <Icon className={clsx('w-[18px] h-[18px] shrink-0', isActive && 'text-accent')} />
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center',
            isActive ? 'bg-accent text-white' : 'bg-white/10 text-white/70'
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
    <div className="min-h-screen bg-cream flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-navy-deep/40 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-64 bg-navy flex flex-col',
          'transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center px-5 h-16 shrink-0">
          <NeuronLogo variant="bare" size="sm" />
        </div>

        {workspaceId && (
          <>
            <div className="px-3 pb-2">
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

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              count={item.countKey ? counts[item.countKey] : undefined}
            />
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-[11px] text-white/40">Your company brain</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-cream/80 backdrop-blur-sm border-b border-warm flex items-center justify-between px-4 lg:px-8 shrink-0 sticky top-0 z-10">
          <button
            className="lg:hidden p-2 rounded-[10px] text-muted hover:bg-gray-100"
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
