import { render, screen } from '@testing-library/react'
import DashboardOverview from '../DashboardOverview'

const emptyData = {
  counts: { active: 0, suggested: 0, decisions: 0, connectedIntegrations: 0, needsAttention: 0, savedContext: 0, dueToday: 0, overdue: 0, sourcedAnswers: 0 },
  suggestedTasks: [], priorityTasks: [], recentDecisions: [], health: [],
}

it('renders a useful empty dashboard and primary navigation links', () => {
  render(<DashboardOverview data={emptyData} />)
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  expect(screen.getByText('Your workspace at a glance.')).toBeInTheDocument()
  expect(screen.getByText('Set up your workspace')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Connect integration/ })).toHaveAttribute('href', '/dashboard/integrations')
  expect(screen.getAllByRole('link', { name: /Active tasks/ })[0]).toHaveAttribute('href', '/dashboard/tasks')
  expect(screen.getAllByRole('link', { name: /Decisions/ })[0]).toHaveAttribute('href', '/dashboard/decisions')
  expect(screen.queryByText('Recent activity')).not.toBeInTheDocument()
  expect(screen.queryByText(/validation signal/i)).not.toBeInTheDocument()
})

it('renders task, decision, and health previews without an activity feed', () => {
  render(<DashboardOverview data={{ ...emptyData,
    counts: { ...emptyData.counts, active: 2, suggested: 1, decisions: 1, connectedIntegrations: 1, savedContext: 8, dueToday: 1, sourcedAnswers: 2 },
    suggestedTasks: [{ id: 't1', title: 'Review contract', sourceType: 'telegram', dueAt: null, priority: 'high' }],
    priorityTasks: [{ id: 'p1', title: 'Send launch brief', sourceType: 'slack', dueAt: '2026-07-21T12:00:00.000Z', priority: 'urgent', status: 'active' }],
    recentDecisions: [{ id: 'd1', title: 'Delay launch', source: 'manual', date: '2026-07-21T00:00:00.000Z' }],
    health: [{ name: 'telegram', status: 'Healthy', lastSyncAt: null }],
  }} />)
  expect(screen.getByText('Review contract')).toBeInTheDocument()
  expect(screen.getByText('Send launch brief')).toBeInTheDocument()
  expect(screen.getByText('Delay launch')).toBeInTheDocument()
  expect(screen.queryByText('Telegram sync completed')).not.toBeInTheDocument()
  expect(screen.getByText('Healthy')).toBeInTheDocument()
})
