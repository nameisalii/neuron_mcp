import { fireEvent, render, screen } from '@testing-library/react'
import DashboardShell from '../DashboardShell'

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard/query' }))
jest.mock('@clerk/nextjs', () => ({ UserButton: () => <div data-testid="user-button">User</div> }))
jest.mock('@/components/WorkspaceSwitcher', () => () => <div>Workspace</div>)
jest.mock('@/components/UpgradeModal', () => () => null)

beforeEach(() => window.localStorage.clear())

it('shows the simplified dashboard navigation expanded by default', () => {
  render(<DashboardShell>Content</DashboardShell>)
  for (const label of ['Dashboard', 'Chat', 'Knowledge', 'Tasks', 'Decisions', 'Integrations', 'Settings']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
  }
  expect(screen.queryByRole('link', { name: 'Query' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Activity' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Feedback' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Notion' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Brain' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Knowledge' })).toHaveAttribute('href', '/dashboard/knowledge')
  expect(screen.queryByRole('link', { name: 'Sources' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Ask' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Digest' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Ideas' })).not.toBeInTheDocument()
})

it('collapses to icon-only desktop navigation, persists, and expands again', () => {
  render(<DashboardShell>Content</DashboardShell>)
  const chat = screen.getByRole('link', { name: 'Chat' })
  expect(withinLinkLabel(chat)).not.toHaveClass('lg:hidden')
  expect(chat).toHaveClass('bg-white/10')

  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
  expect(withinLinkLabel(chat)).toHaveClass('lg:hidden')
  expect(chat).toHaveClass('bg-white/10')
  expect(window.localStorage.getItem('neuron.sidebarCollapsed')).toBe('true')

  fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
  expect(withinLinkLabel(chat)).not.toHaveClass('lg:hidden')
  expect(window.localStorage.getItem('neuron.sidebarCollapsed')).toBe('false')
})

it('renders one profile menu in the sidebar footer and uses a wide main viewport', () => {
  render(<DashboardShell>Content</DashboardShell>)

  expect(screen.getAllByTestId('user-button')).toHaveLength(1)
  expect(screen.getByTestId('sidebar-profile')).toContainElement(screen.getByTestId('user-button'))
  expect(screen.getByTestId('dashboard-main')).toHaveClass('min-w-0', 'overflow-x-hidden', 'xl:px-10')
  expect(screen.getByTestId('dashboard-main').firstElementChild).toHaveClass('w-full', 'max-w-[1800px]')

  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
  expect(screen.getByText('Profile & account')).toHaveClass('lg:hidden')
  expect(screen.getAllByTestId('user-button')).toHaveLength(1)
})

function withinLinkLabel(link: HTMLElement) {
  return Array.from(link.querySelectorAll('span')).find((node) => node.childElementCount === 0 && node.textContent === 'Chat') as HTMLElement
}
