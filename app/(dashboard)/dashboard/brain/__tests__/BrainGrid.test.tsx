import { fireEvent, render, screen } from '@testing-library/react'
import BrainGrid from '../BrainGrid'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const items = [
  { id: '1', content: 'Choose Postgres', category: 'decision', source: 'slack', confidence: 0.9, verified: false, verifiedAt: null, frozen: false, conflictNote: null, createdAt: '2026-01-01' },
  { id: '2', content: 'Refund rule', category: 'rule', source: 'notion', confidence: 0.8, verified: false, verifiedAt: null, frozen: false, conflictNote: null, createdAt: '2026-01-02' },
]

it('shows all knowledge by default and updates URL filter state', () => {
  render(<BrainGrid items={items} activeFilter="all" />)
  expect(screen.getByText('Choose Postgres')).toBeInTheDocument()
  expect(screen.getByText('Refund rule')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Decisions' }))
  expect(push).toHaveBeenCalledWith('/dashboard/overview?filter=decisions')
})

it('shows only the selected category', () => {
  render(<BrainGrid items={[items[0]]} activeFilter="decisions" />)
  expect(screen.getByText('Choose Postgres')).toBeInTheDocument()
  expect(screen.queryByText('Refund rule')).not.toBeInTheDocument()
})

it('shows one canonical card for multiple records from the same Linear issue', () => {
  const shared = { source: 'linear', sourceExternalId: 'issue-1', sourceUrl: 'https://linear.app/issue/DT-38' }
  render(<BrainGrid items={[
    { ...items[0], ...shared, id: 'fragment', content: 'Team: DeepTracer' },
    { ...items[0], ...shared, id: 'canonical', content: 'Linear issue DT-38: Limit unauthorized users\nStatus: Canceled\nTeam: DeepTracer' },
  ]} />)
  expect(screen.getByText('DT-38: Limit unauthorized users')).toBeInTheDocument()
  expect(screen.queryByText('Team: DeepTracer')).not.toBeInTheDocument()
  expect(screen.getByText('1 of 1 items')).toBeInTheDocument()
})
