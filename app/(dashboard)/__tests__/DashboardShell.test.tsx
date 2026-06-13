import { render, screen } from '@testing-library/react'
import DashboardShell from '../DashboardShell'

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard/overview' }))
jest.mock('@clerk/nextjs', () => ({ UserButton: () => <div>User</div> }))
jest.mock('@/components/WorkspaceSwitcher', () => () => <div>Workspace</div>)
jest.mock('@/components/UpgradeModal', () => () => null)

it('shows the simplified dashboard navigation', () => {
  render(<DashboardShell counts={{ brain: 1, decisions: 1, ideas: 1 }}>Content</DashboardShell>)
  for (const label of ['Overview', 'Query', 'Activity', 'Integrations', 'Capture']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
  }
  expect(screen.queryByRole('link', { name: 'Notion' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Brain' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Decisions' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Ideas' })).not.toBeInTheDocument()
})
