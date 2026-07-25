'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { LayoutDashboard, Search, Plug, Menu, X, Settings, Activity, ListTodo, PanelLeftClose, PanelLeftOpen, GitBranch, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/query', label: 'Query', icon: Search },
  { href: '/dashboard/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/dashboard/decisions', label: 'Decisions', icon: GitBranch },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug },
  { href: '/dashboard/activity', label: 'Activity', icon: Activity },
  { href: '/dashboard/feedback', label: 'Feedback', icon: MessageSquare },
  { href: '/dashboard/settings/capture', label: 'Settings', icon: Settings },
]

interface NavLinkProps extends NavItem {
  count?: number
  collapsed?: boolean
}

function NavLink({ href, label, icon: Icon, exact, count, collapsed = false }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={clsx(
        'group relative flex items-center gap-3 rounded-[10px] py-2.5 text-sm font-medium transition-colors',
        collapsed ? 'justify-between px-3 lg:justify-center lg:px-2' : 'justify-between px-3',
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
        <span className={collapsed ? 'lg:hidden' : undefined}>{label}</span>
      </span>
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center',
            collapsed && 'lg:hidden',
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem('neuron.sidebarCollapsed') === 'true')
  }, [])

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current
      window.localStorage.setItem('neuron.sidebarCollapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-cream">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-black text-white',
          'transform transition-[transform,width] duration-200 lg:static lg:z-auto lg:h-screen lg:translate-x-0',
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className={clsx('flex h-16 shrink-0 items-center gap-2', sidebarCollapsed ? 'justify-between px-5 lg:justify-center lg:px-2' : 'justify-between px-5')}>
          {sidebarCollapsed ? <><NeuronLogo variant="bare" size="sm" className="lg:hidden"/><NeuronLogo variant="bare" size="sm" showWord={false} className="hidden lg:flex"/></> : <NeuronLogo variant="bare" size="sm" />}
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden rounded-lg p-2 text-white/55 transition hover:bg-white/10 hover:text-white lg:inline-flex"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {workspaceId && (
          <div className={sidebarCollapsed ? 'lg:hidden' : undefined}>
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
          </div>
        )}

        <nav className={clsx('flex-1 space-y-1 overflow-y-auto px-3 py-3', sidebarCollapsed && 'lg:px-2')}>
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              collapsed={sidebarCollapsed}
              count={item.countKey ? counts[item.countKey] : undefined}
            />
          ))}
        </nav>

        <div className={clsx('border-t border-white/10 px-5 py-4', sidebarCollapsed && 'lg:hidden')}><p className="text-[11px] text-white/40">Neuron workspace</p></div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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

        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
