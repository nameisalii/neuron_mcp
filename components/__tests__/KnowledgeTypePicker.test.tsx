import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import KnowledgeTypePicker, { labelForDisplayCategory } from '../KnowledgeTypePicker'

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ category: 'rule' }),
  }) as unknown as typeof fetch
})

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Type' }))
}

test('renders Fact, Rule, Decision and Idea options', () => {
  render(<KnowledgeTypePicker itemId="ki-1" category="facts" />)
  open()
  for (const label of ['Fact', 'Rule', 'Decision', 'Idea']) {
    expect(screen.getByRole('menuitemradio', { name: label })).toBeInTheDocument()
  }
})

test('preselects the existing category', () => {
  render(<KnowledgeTypePicker itemId="ki-1" category="decisions" />)
  open()
  expect(screen.getByRole('menuitemradio', { name: 'Decision' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('menuitemradio', { name: 'Fact' })).toHaveAttribute('aria-checked', 'false')
})

test('changing type sends the uppercase API value', async () => {
  render(<KnowledgeTypePicker itemId="ki-42" category="facts" />)
  open()
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rule' }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/knowledge-items/ki-42',
    expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ type: 'RULE' }) }),
  ))
})

test('notifies the parent after a successful change', async () => {
  const onCategoryChange = jest.fn()
  render(<KnowledgeTypePicker itemId="ki-7" category="facts" onCategoryChange={onCategoryChange} />)
  open()
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Idea' }))

  await waitFor(() => expect(onCategoryChange).toHaveBeenCalledWith('ki-7', 'ideas'))
})

test('rolls back the badge when the update is rejected', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: 'Forbidden' }),
  }) as unknown as typeof fetch

  render(<KnowledgeTypePicker itemId="ki-9" category="facts" />)
  open()
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rule' }))

  await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Type' })).toHaveTextContent('Fact')
})

test('shows a readable label for non-selectable and unknown categories', () => {
  expect(labelForDisplayCategory('processes')).toBe('Process')
  expect(labelForDisplayCategory('other')).toBe('Uncategorized')
})

test('card badge shows the current type', () => {
  render(<KnowledgeTypePicker itemId="ki-1" category="rules" />)
  expect(screen.getByRole('button', { name: 'Type' })).toHaveTextContent('Rule')
})
