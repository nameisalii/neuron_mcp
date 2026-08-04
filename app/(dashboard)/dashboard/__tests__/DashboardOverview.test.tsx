import { render, screen, within } from '@testing-library/react'
import DashboardOverview from '../DashboardOverview'

const emptyData = {
  counts: {
    active: 0, suggested: 0, decisions: 0, connectedIntegrations: 0, savedContext: 0, rules: 0,
    dueToday: 0, overdue: 0, upcomingIntegrations: 2, integrationErrors: 0,
  },
  suggestedTasks: [],
  priorityTasks: [],
  recentDecisions: [],
  health: [
    { name: 'gmail', status: 'Upcoming' as const, lastSyncAt: null },
    { name: 'microsoft_teams', status: 'Upcoming' as const, lastSyncAt: null },
  ],
}

const populatedData = {
  counts: {
    active: 4, suggested: 2, decisions: 3, connectedIntegrations: 2, savedContext: 28, rules: 5,
    dueToday: 1, overdue: 2, upcomingIntegrations: 2, integrationErrors: 1,
  },
  suggestedTasks: [
    { id: 'suggested-1', title: 'Review driver paperwork', sourceType: 'telegram', dueAt: '2026-07-26T12:00:00.000Z', priority: 'high' },
  ],
  priorityTasks: [
    { id: 'task-1', title: 'Send overdue invoice', sourceType: 'datatruck', dueAt: '2026-07-24T12:00:00.000Z', priority: 'urgent' },
  ],
  recentDecisions: [
    { id: 'decision-1', title: 'Use the northern route', source: 'slack', status: 'Remembered', date: '2026-07-24T12:00:00.000Z' },
  ],
  health: [
    { name: 'telegram', status: 'Connected' as const, lastSyncAt: null },
    { name: 'datatruck', status: 'Connected' as const, lastSyncAt: null },
    { name: 'five_eld', status: 'Needs attention' as const, lastSyncAt: null },
    { name: 'gmail', status: 'Upcoming' as const, lastSyncAt: null },
    { name: 'microsoft_teams', status: 'Upcoming' as const, lastSyncAt: null },
  ],
}

it('renders overview cards with the expected destinations', () => {
  render(<DashboardOverview data={emptyData} />)

  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  expect(screen.getByText('Your workspace at a glance.')).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: /Active tasks/ })[0]).toHaveAttribute('href', '/dashboard/tasks')
  expect(screen.getAllByRole('link', { name: /Decisions/ })[0]).toHaveAttribute('href', '/dashboard/decisions')
  expect(screen.getByRole('link', { name: /Total knowledge/ })).toHaveAttribute('href', '/dashboard/knowledge')
  expect(screen.getByRole('link', { name: /Rules/ })).toHaveAttribute('href', '/dashboard/knowledge?type=rules')
  expect(screen.getAllByRole('link', { name: /Integrations/ })[0]).toHaveAttribute('href', '/dashboard/integrations')
})

it('restores Today, Suggested tasks, Recent decisions, Integration health, and Needs attention', () => {
  render(<DashboardOverview data={populatedData} />)

  for (const heading of ['Today', 'Suggested tasks', 'Recent decisions', 'Integration health', 'Needs attention']) {
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  }
  expect(screen.getByText('Send overdue invoice')).toBeInTheDocument()
  expect(screen.getByText('Review driver paperwork')).toBeInTheDocument()
  expect(screen.getByText('Use the northern route')).toBeInTheDocument()
  expect(screen.getByText('Remembered')).toBeInTheDocument()
  expect(screen.getByText('Five ELD')).toBeInTheDocument()
  expect(screen.getByText('Microsoft Teams')).toBeInTheDocument()
  expect(screen.getByText('2 overdue tasks')).toBeInTheDocument()
  expect(screen.getByText('2 suggested tasks waiting for review')).toBeInTheDocument()
  expect(screen.getByText('1 integration needs attention')).toBeInTheDocument()
})

it('handles an empty workspace with compact empty states', () => {
  render(<DashboardOverview data={emptyData} />)

  expect(screen.getByText('Set up your workspace')).toBeInTheDocument()
  expect(screen.getByText('No urgent tasks today.')).toBeInTheDocument()
  expect(screen.getByText('No suggested tasks waiting.')).toBeInTheDocument()
  expect(screen.getByText('No decisions yet.')).toBeInTheDocument()
  expect(screen.getByText('Nothing needs attention right now.')).toBeInTheDocument()
  expect(screen.getByText('Gmail')).toBeInTheDocument()
  expect(screen.getByText('Microsoft Teams')).toBeInTheDocument()
})

it('does not put Knowledge lists, filters, or Activity on Dashboard', () => {
  render(<DashboardOverview data={populatedData} />)

  expect(screen.queryByTestId('knowledge-grid')).not.toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Knowledge types' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Recent activity' })).not.toBeInTheDocument()
  expect(screen.queryByText(/validation signal/i)).not.toBeInTheDocument()
})

it('uses mobile-first single-column layouts that expand on larger screens', () => {
  render(<DashboardOverview data={populatedData} />)

  expect(screen.getByRole('region', { name: 'Dashboard overview' })).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3')
  expect(screen.getByTestId('dashboard-detail-grid')).toHaveClass('grid-cols-1', 'items-start', 'lg:grid-cols-2')
  const today = screen.getByRole('heading', { name: 'Today' }).closest('section')
  expect(today).toBeInTheDocument()
  expect(within(today!).getByText('Due today')).toBeInTheDocument()
})

it('stacks Today and Suggested tasks naturally in the same column without reserved height', () => {
  render(<DashboardOverview data={emptyData} />)

  const leftColumn = screen.getByTestId('dashboard-left-column')
  expect(leftColumn).toHaveClass('space-y-6')
  expect(leftColumn.className).not.toMatch(/(?:^|\s)(?:min-h-|h-\[|h-screen|auto-rows-fr)/)
  expect(Array.from(leftColumn.querySelectorAll('h2')).map(heading => heading.textContent)).toEqual(['Today', 'Suggested tasks'])
  expect(within(leftColumn).getByText('No urgent tasks today.')).toHaveClass('px-3', 'py-3')
  expect(leftColumn.querySelector('[data-testid="knowledge-grid"]')).not.toBeInTheDocument()
  expect(leftColumn.querySelector('[data-testid="activity-feed"]')).not.toBeInTheDocument()
})
