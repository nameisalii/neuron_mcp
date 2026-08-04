'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { LayoutDashboard, MessageCircle, Plug, Menu, X, Settings, ListTodo, PanelLeftClose, PanelLeftOpen, GitBranch, BookOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import UpgradeModal from '@/components/UpgradeModal'
import NeuronLogo from '@/components/NeuronLogo'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  exact?: boolean
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/query', label: 'Chat', icon: MessageCircle },
  { href: '/dashboard/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/dashboard/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/dashboard/decisions', label: 'Decisions', icon: GitBranch },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug },
  { href: '/dashboard/settings/capture', label: 'Settings', icon: Settings },
]

interface NavLinkProps extends NavItem {
  collapsed?: boolean
}

function NavLink({ href, label, icon: Icon, exact, collapsed = false }: NavLinkProps) {
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
    </Link>
  )
}

export default function DashboardShell({
  children,
  workspaceId,
}: {
  children: React.ReactNode
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
            />
          ))}
        </nav>

        <div
          data-testid="sidebar-profile"
          className={clsx(
            'mt-auto flex shrink-0 items-center gap-3 border-t border-white/10 px-5 py-4',
            sidebarCollapsed && 'lg:justify-center lg:px-2'
          )}
        >
          <UserButton />
          <span className={clsx('min-w-0 text-xs text-white/55', sidebarCollapsed && 'lg:hidden')}>
            Profile &amp; account
          </span>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b border-warm bg-cream/80 px-3 backdrop-blur-sm lg:hidden">
          <button
            className="rounded-[10px] p-2 text-muted hover:bg-gray-100"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        <main
          data-testid="dashboard-main"
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10"
        >
          <div className="mx-auto w-full max-w-[1800px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
