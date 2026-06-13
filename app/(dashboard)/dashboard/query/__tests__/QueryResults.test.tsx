import { fireEvent, render, screen } from '@testing-library/react'
import QueryResults from '../QueryResults'
import type { SourceItem } from '../SourceCard'

function source(index: number, overrides: Partial<SourceItem> = {}): SourceItem {
  return {
    chunkId: `source-${index}`,
    pageId: null,
    pageTitle: `Source ${index}`,
    notionPageId: null,
    content: `Linear issue DT-${index}: Issue ${index}. Status: In Progress.`,
    labels: ['status_update'],
    source: 'linear',
    sourceUrl: `https://linear.app/issue/DT-${index}`,
    sourceExternalId: `issue-${index}`,
    owner: 'Ali',
    sourceCreatedAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    relevanceScore: 1 - index / 10,
    ...overrides,
  }
}

it('renders the answer before the top sources and only shows three by default', () => {
  const { container } = render(<QueryResults answer="DeepTracer has active issues." sources={[1, 2, 3, 4].map((index) => source(index))} complete copied={false} onCopy={jest.fn()} />)
  expect(screen.getByText('DeepTracer has active issues.')).toBeInTheDocument()
  expect(screen.getByText('DT-1: Issue 1')).toBeInTheDocument()
  expect(screen.queryByText('DT-4: Issue 4')).not.toBeInTheDocument()
  expect(container.textContent?.indexOf('Answer')).toBeLessThan(container.textContent?.indexOf('Top Sources') ?? 0)
})

it('shows remaining sources on demand', () => {
  render(<QueryResults answer="Answer" sources={[1, 2, 3, 4].map((index) => source(index))} complete copied={false} onCopy={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show more sources (1)' }))
  expect(screen.getByText('DT-4: Issue 4')).toBeInTheDocument()
})

it('formats status_update as Status Update', () => {
  render(<QueryResults answer="Answer" sources={[source(1)]} complete copied={false} onCopy={jest.fn()} />)
  expect(screen.getByText('Status Update')).toBeInTheDocument()
  expect(screen.queryByText('status_update')).not.toBeInTheDocument()
})

it('shows the weak-answer fallback with the closest sources', () => {
  render(<QueryResults answer="" sources={[source(1)]} complete copied={false} onCopy={jest.fn()} />)
  expect(screen.getByText(/could not find enough information to answer confidently/i)).toBeInTheDocument()
  expect(screen.getByText('DT-1: Issue 1')).toBeInTheDocument()
})
