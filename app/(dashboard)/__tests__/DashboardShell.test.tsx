import { fireEvent, render, screen } from '@testing-library/react'
import DashboardShell from '../DashboardShell'

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard/query' }))
jest.mock('@clerk/nextjs', () => ({ UserButton: () => <div>User</div> }))
jest.mock('@/components/WorkspaceSwitcher', () => () => <div>Workspace</div>)
jest.mock('@/components/UpgradeModal', () => () => null)

beforeEach(() => window.localStorage.clear())

it('shows the simplified dashboard navigation expanded by default', () => {
  render(<DashboardShell counts={{ brain: 1, decisions: 1, ideas: 1 }}>Content</DashboardShell>)
  for (const label of ['Dashboard', 'Query', 'Tasks', 'Decisions', 'Integrations', 'Activity', 'Feedback', 'Settings']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
  }
  expect(screen.queryByRole('link', { name: 'Notion' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Brain' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Knowledge' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Sources' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Digest' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Ideas' })).not.toBeInTheDocument()
})

it('collapses to icon-only desktop navigation, persists, and expands again', () => {
  render(<DashboardShell counts={{ brain: 1, decisions: 1, ideas: 1 }}>Content</DashboardShell>)
  const query = screen.getByRole('link', { name: 'Query' })
  expect(withinLinkLabel(query)).not.toHaveClass('lg:hidden')
  expect(query).toHaveClass('bg-white/10')

  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
  expect(withinLinkLabel(query)).toHaveClass('lg:hidden')
  expect(query).toHaveClass('bg-white/10')
  expect(window.localStorage.getItem('neuron.sidebarCollapsed')).toBe('true')

  fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
  expect(withinLinkLabel(query)).not.toHaveClass('lg:hidden')
  expect(window.localStorage.getItem('neuron.sidebarCollapsed')).toBe('false')
})

function withinLinkLabel(link: HTMLElement) {
  return Array.from(link.querySelectorAll('span')).find((node) => node.childElementCount === 0 && node.textContent === 'Query') as HTMLElement
}
