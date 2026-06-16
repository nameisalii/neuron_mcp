import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import KnowledgeCard from '../KnowledgeCard'

const content = `Linear issue DT-38: URGENT: Limit Unauthorized User on DeepTracer Website to create jobs
Description:
**Objective:** Only logged-in users should be able to create jobs.
[PR](https://github.com/DrDongSi/Deep-Tracer-Website/pull/279)
Status: Canceled (canceled)
Team: DeepTracer (DT)
Priority: Urgent (1)
Labels: frontend, Testing
Updated: 2026-02-10T15:34:43.287Z
Creator: rzhu@overlake.org
Linear URL: https://linear.app/deeptracer/issue/DT-38/example`

it('keeps raw Linear content collapsed and exposes clean actions and labels', () => {
  render(<KnowledgeCard item={{ content, category: 'status_update', source: 'linear', sourceUrl: 'https://linear.app/deeptracer/issue/DT-38/example' }} />)

  expect(screen.getByText('DT-38: Limit Unauthorized User on DeepTracer Website to create jobs')).toBeInTheDocument()
  expect(screen.getByText('Status Update')).toBeInTheDocument()
  expect(screen.getByText('Canceled')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Open in Linear/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Open GitHub PR/ })).toBeInTheDocument()
  expect(screen.queryByText('rzhu@overlake.org')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
  expect(screen.getByText('rzhu@overlake.org')).toBeInTheDocument()
  expect(screen.getByText('Raw source text')).toBeInTheDocument()
})

it('optimistically retags a knowledge item', async () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: 'item-1',
      category: 'process',
      aiSuggestedCategory: 'rule',
      typeOverriddenByUser: true,
    }),
  } as Response)
  global.fetch = fetchMock as typeof fetch
  const onCategoryChange = jest.fn()

  render(
    <KnowledgeCard
      item={{ id: 'item-1', content: 'Refunds over $500 need approval', category: 'rule', source: 'slack', aiSuggestedCategory: 'rule' }}
      onCategoryChange={onCategoryChange}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: /Rule/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Process' }))

  expect(screen.getByRole('button', { name: /Process/ })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('Updated to Process')).toBeInTheDocument())
  expect(fetchMock).toHaveBeenCalledWith('/api/knowledge-items/item-1', expect.objectContaining({ method: 'PATCH' }))
  expect(onCategoryChange).toHaveBeenCalledWith('item-1', 'process', 'rule', 'optimistic')

  if (originalFetch) global.fetch = originalFetch
  else delete (global as { fetch?: typeof fetch }).fetch
})
