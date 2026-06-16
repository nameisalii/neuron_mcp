import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import OverviewClient from '../OverviewClient'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const items = [
  {
    id: 'item-1',
    content: 'Refund policy',
    category: 'rule',
    aiSuggestedCategory: 'rule',
    source: 'slack',
    confidence: 0.9,
    verified: false,
    verifiedAt: null,
    frozen: false,
    conflictNote: null,
    createdAt: '2026-06-16T00:00:00.000Z',
  },
]

it('updates overview counts when a card is retagged', async () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: 'item-1',
      category: 'decision',
      aiSuggestedCategory: 'rule',
      typeOverriddenByUser: true,
    }),
  } as Response)
  global.fetch = fetchMock as typeof fetch

  render(
    <OverviewClient
      activeFilter="all"
      initialItems={items}
      initialCounts={{ all: 1, decision: 0, idea: 0 }}
      lastSyncLabel="just now"
    />,
  )

  fireEvent.click(screen.getByTitle('Change type'))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Decision' }))

  try {
    await waitFor(() => expect(screen.getByText('Updated to Decision')).toBeInTheDocument())
    const knowledgeLabel = screen.getByText('Knowledge Items')
    const decisionLabel = screen.getAllByText('Decisions').find((element) => element.tagName === 'P')
    expect(knowledgeLabel.previousElementSibling).toHaveTextContent('1')
    expect(decisionLabel?.previousElementSibling).toHaveTextContent('1')
  } finally {
    if (originalFetch) global.fetch = originalFetch
    else delete (global as { fetch?: typeof fetch }).fetch
  }
})
