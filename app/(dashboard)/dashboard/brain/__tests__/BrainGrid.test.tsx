import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import BrainGrid from '../BrainGrid'

const items = [
  { id: '1', displayTitle: 'Database choice', displaySummary: 'Choose Postgres', content: 'Choose Postgres', category: 'decision', source: 'slack', displayStatus: 'verified', displayTags: ['architecture'], confidence: 0.9, verified: true, verifiedAt: null, frozen: false, conflictNote: null, createdAt: '2026-01-01' },
  { id: '2', displayTitle: 'Refund rule', displaySummary: 'Refund rule', content: 'Refund rule', category: 'rule', source: 'notion', displayStatus: 'needs_review', displayTags: [], confidence: 0.8, verified: false, verifiedAt: null, frozen: false, conflictNote: null, createdAt: '2026-01-02' },
  { id: '3', displayTitle: 'Old hidden item', displaySummary: 'Old hidden item', content: 'Old hidden item', category: 'fact', source: 'slack', displayStatus: 'archived', displayTags: [], confidence: 0.5, verified: false, verifiedAt: null, frozen: false, conflictNote: null, createdAt: '2026-01-03' },
]

beforeEach(() => { global.fetch = jest.fn() })

it('shows non-archived knowledge by default and filters lifecycle status', () => {
  render(<BrainGrid items={items} activeFilter="all" />)
  expect(screen.getByText('Choose Postgres')).toBeInTheDocument()
  expect(screen.getAllByText('Refund rule').length).toBeGreaterThan(0)
  expect(screen.queryByText('Old hidden item')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Needs review' }))
  expect(screen.getAllByText('Refund rule').length).toBeGreaterThan(0)
  expect(screen.queryByText('Choose Postgres')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
  expect(screen.getAllByText('Old hidden item').length).toBeGreaterThan(0)
})

it('shows only the selected category', () => {
  render(<BrainGrid items={[items[0]]} activeFilter="decisions" />)
  expect(screen.getByText('Choose Postgres')).toBeInTheDocument()
  expect(screen.queryByText('Refund rule')).not.toBeInTheDocument()
})

it('filters by source, category, and search', () => {
  render(<BrainGrid items={items} />)
  fireEvent.change(screen.getByLabelText('Filter by source'), { target: { value: 'notion' } })
  expect(screen.getAllByText('Refund rule').length).toBeGreaterThan(0)
  expect(screen.queryByText('Choose Postgres')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Filter by source'), { target: { value: 'all' } })
  fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'decision' } })
  expect(screen.getByText('Choose Postgres')).toBeInTheDocument()
  fireEvent.change(screen.getByPlaceholderText('Search knowledge…'), { target: { value: 'architecture' } })
  expect(screen.getByText('Choose Postgres')).toBeInTheDocument()
})

it('opens knowledge detail with relationships and original content', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({
    item: { ...items[0], summary: 'Postgres is the standard database.', updatedAt: '2026-01-02', sourceMetadata: { channel: 'engineering' } },
    related: { tasks: [{ id: 'task-1', title: 'Migrate database', status: 'active' }], decisions: [], documents: [] },
  }) } as Response)
  render(<BrainGrid items={[items[0]]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  expect(await screen.findByRole('complementary', { name: 'Knowledge details' })).toBeInTheDocument()
  expect(await screen.findByText('Original content')).toBeInTheDocument()
  expect(screen.getByText(/Migrate database/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close knowledge details' }))
  await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Knowledge details' })).not.toBeInTheDocument())
})

it('shows one canonical card for multiple records from the same Linear issue', () => {
  const shared = { source: 'linear', sourceExternalId: 'issue-1', displaySourceUrl: 'https://linear.app/issue/DT-38' }
  render(<BrainGrid items={[
    { ...items[0], ...shared, id: 'fragment', content: 'Team: DeepTracer' },
    { ...items[0], ...shared, id: 'canonical', content: 'Linear issue DT-38: Limit unauthorized users\nStatus: Canceled\nTeam: DeepTracer' },
  ]} />)
  expect(screen.getByText('DT-38: Limit unauthorized users')).toBeInTheDocument()
  expect(screen.queryByText('Team: DeepTracer')).not.toBeInTheDocument()
  expect(screen.getByText('1 of 1 items')).toBeInTheDocument()
})
