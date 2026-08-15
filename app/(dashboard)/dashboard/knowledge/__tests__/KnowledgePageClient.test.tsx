import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import KnowledgePageClient from '../KnowledgePageClient'
import type { KnowledgeGridItem } from '../KnowledgeGrid'

jest.mock('@/components/knowledge/KnowledgeSphereView', () => ({
  __esModule: true,
  default: ({ graph }: { graph: { nodes: unknown[] } }) => graph.nodes.length
    ? <div>3D Knowledge Map</div>
    : <div>No knowledge to map yet.</div>,
}))

const categories = ['rules', 'decisions', 'ideas', 'facts', 'processes'] as const
const items: KnowledgeGridItem[] = Array.from({ length: 15 }, (_, index) => ({
  id: `knowledge-${index + 1}`,
  title: `Knowledge title ${index + 1}`,
  summary: `Knowledge summary ${index + 1}`,
  content: `Original knowledge content ${index + 1}`,
  category: categories[index % categories.length],
  source: index % 3 === 0 ? 'telegram' : index % 3 === 1 ? 'datatruck' : 'slack',
  date: `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
  verified: index === 0,
  sourceUrl: index === 0 ? 'https://example.com/context' : null,
}))

const counts = { total: 15, rules: 3, decisions: 3, integrations: 3 }

it('renders the Knowledge header, overview cards, and all type filters', () => {
  render(<KnowledgePageClient counts={counts} items={items} initialType="all" />)

  expect(screen.getByRole('heading', { name: 'Knowledge' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Universe' })).toBeInTheDocument()
  expect(screen.getByText('Saved context from your integrations and workspace.')).toBeInTheDocument()
  for (const label of ['Total knowledge', 'Rules', 'Decisions', 'Integrations']) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  }
  for (const label of ['All', 'Rules', 'Decisions', 'Ideas', 'Facts', 'Processes']) {
    expect(screen.getByRole('button', { name: new RegExp(`^${label} \\d+$`) })).toBeInTheDocument()
  }
})

it('loads the 3D graph on demand and returns to the list', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ nodes: [], edges: [], stats: { totalKnowledge: 0, totalSources: 0, totalEdges: 0, largestNodeSize: 0 } }) }) as unknown as typeof fetch
  render(<KnowledgePageClient counts={counts} items={items} initialType="all" />)
  fireEvent.click(screen.getByRole('button', { name: 'Universe' }))
  expect(screen.getByRole('status')).toHaveTextContent('Loading 3D knowledge map')
  expect(await screen.findByText('No knowledge to map yet.')).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledWith('/api/knowledge/graph')
  fireEvent.click(screen.getByRole('button', { name: 'List' }))
  expect(screen.getByRole('region', { name: 'Knowledge list' })).toBeInTheDocument()
})

it('shows a graph error state', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
  render(<KnowledgePageClient counts={counts} items={items} initialType="all" />)
  fireEvent.click(screen.getByRole('button', { name: 'Universe' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not load the knowledge map.'))
})

it('preselects the Rules filter from the server-provided query type', () => {
  render(<KnowledgePageClient counts={counts} items={items} initialType="rules" />)

  expect(screen.getByRole('button', { name: 'Rules 3' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByTestId('knowledge-preview-card')).toHaveLength(3)
})

it('shows eight cards initially, adds six, and resets the limit when filters change', () => {
  render(<KnowledgePageClient counts={counts} items={items} initialType="all" />)

  expect(screen.getAllByTestId('knowledge-preview-card')).toHaveLength(8)
  expect(screen.getByText('Showing 8 of 15')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'See more' }))
  expect(screen.getAllByTestId('knowledge-preview-card')).toHaveLength(14)
  expect(screen.getByText('Showing 14 of 15')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Facts 3' }))
  expect(screen.getAllByTestId('knowledge-preview-card')).toHaveLength(3)
  expect(screen.getByText('Showing 3 of 3')).toBeInTheDocument()
})

it('supports multiple integration selections and shows either selected integration', () => {
  render(<KnowledgePageClient counts={counts} items={items} initialType="all" />)

  fireEvent.click(screen.getByRole('button', { name: 'All integrations' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Telegram/ }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Datatruck/ }))

  expect(screen.getByRole('button', { name: '2 selected' })).toBeInTheDocument()
  const cards = screen.getAllByTestId('knowledge-preview-card')
  expect(cards).toHaveLength(8)
  expect(cards.every(card => /Telegram|Datatruck/.test(card.textContent ?? ''))).toBe(true)
  expect(cards.some(card => /Telegram/.test(card.textContent ?? ''))).toBe(true)
  expect(cards.some(card => /Datatruck/.test(card.textContent ?? ''))).toBe(true)
})

it('renders compact card details in a mobile-first one-column grid', () => {
  render(<KnowledgePageClient counts={counts} items={[items[0]]} initialType="all" />)

  expect(screen.getByText('Knowledge title 1')).toBeInTheDocument()
  expect(screen.getByText('Knowledge summary 1')).toBeInTheDocument()
  expect(screen.getByText('Telegram')).toBeInTheDocument()
  expect(screen.getByText('Verified')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Knowledge title 1' })).toBeInTheDocument()
  expect(screen.getByTestId('knowledge-grid')).toHaveClass('grid-cols-1', 'md:grid-cols-2')
  fireEvent.click(screen.getByRole('button', { name: 'Details' }))
  expect(screen.getByText('Original knowledge content 1')).toBeInTheDocument()
})

// --- Retagging must move the summary cards immediately (regression) ---

it('updates the Rules and Decisions cards when an item is retagged', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ category: 'rule' }),
  }) as unknown as typeof fetch

  // knowledge-2 is a 'decisions' item (index 1 of the category cycle).
  render(<KnowledgePageClient counts={counts} items={items} initialType="all" />)

  const overview = screen.getByRole('region', { name: 'Knowledge overview' })
  const rulesCard = within(overview).getByText('Rules').closest('div') as HTMLElement
  const decisionsCard = within(overview).getByText('Decisions').closest('div') as HTMLElement
  expect(rulesCard).toHaveTextContent('3')
  expect(decisionsCard).toHaveTextContent('3')

  const pickers = screen.getAllByRole('button', { name: 'Type' })
  const decisionPicker = pickers.find((button) => button.textContent?.includes('Decision')) as HTMLElement
  fireEvent.click(decisionPicker)
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rule' }))

  // Counts move on click, not after the network round-trip.
  expect(rulesCard).toHaveTextContent('4')
  expect(decisionsCard).toHaveTextContent('2')
})

it('reverts the cards when the retag request fails', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: 'Forbidden' }),
  }) as unknown as typeof fetch

  render(<KnowledgePageClient counts={counts} items={items} initialType="all" />)
  const overview = screen.getByRole('region', { name: 'Knowledge overview' })
  const rulesCard = within(overview).getByText('Rules').closest('div') as HTMLElement

  const pickers = screen.getAllByRole('button', { name: 'Type' })
  const decisionPicker = pickers.find((button) => button.textContent?.includes('Decision')) as HTMLElement
  fireEvent.click(decisionPicker)
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rule' }))

  await screen.findByText('Forbidden')
  expect(rulesCard).toHaveTextContent('3')
})
