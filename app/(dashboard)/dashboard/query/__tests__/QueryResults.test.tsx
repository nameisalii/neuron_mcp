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
    sourceMetadata: null,
    owner: 'Ali',
    sourceCreatedAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    relevanceScore: 1 - index / 10,
    ...overrides,
  }
}

it('renders the answer without duplicated inner Neuron branding before collapsed sources', () => {
  const { container } = render(<QueryResults answer="DeepTracer has active issues." sources={[1, 2, 3, 4].map((index) => source(index))} complete copied={false} onCopy={jest.fn()} />)
  expect(screen.getByText('DeepTracer has active issues.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'From integrations (4)' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText(/DT-1: Issue 1/)).not.toBeInTheDocument()
  expect(screen.queryByText(/DT-4: Issue 4/)).not.toBeInTheDocument()
  const answer = screen.getByRole('region', { name: 'Neuron answer' })
  expect(answer.querySelector('img[src="/neuron-assistant-logo.png"]')).toBeNull()
  expect(answer.querySelector('h2')).toBeNull()
  expect(container.textContent).not.toContain('Neuron')
})

it('shows lightweight confidence and conflict guidance', () => {
  const { rerender } = render(<QueryResults answer="Answer" sources={[source(1, { verified: true })]} complete copied={false} onCopy={jest.fn()} />)
  expect(screen.getByText('High confidence')).toBeInTheDocument()
  rerender(<QueryResults answer="Answer" sources={[source(1, { conflictNote: 'Two records disagree' })]} complete copied={false} onCopy={jest.fn()} />)
  expect(screen.getByText('Low confidence')).toBeInTheDocument()
  expect(screen.getByText('Some sources may conflict. Review source cards.')).toBeInTheDocument()
})

it('expands sources on demand', () => {
  render(<QueryResults answer="Answer" sources={[1, 2, 3, 4].map((index) => source(index))} complete copied={false} onCopy={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'From integrations (4)' }))
  expect(screen.getByText(/DT-1: Issue 1/)).toBeInTheDocument()
  expect(screen.getByText(/DT-4: Issue 4/)).toBeInTheDocument()
  fireEvent.click(screen.getByText('Show less'))
  expect(screen.queryByText(/DT-1: Issue 1/)).not.toBeInTheDocument()
})

it('formats status_update as Status Update', () => {
  render(<QueryResults answer="Answer" sources={[source(1)]} complete copied={false} onCopy={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'From integrations (1)' }))
  expect(screen.getByText('Status Update')).toBeInTheDocument()
  expect(screen.queryByText('status_update')).not.toBeInTheDocument()
})

it('shows the weak-answer fallback with the closest sources', () => {
  render(<QueryResults answer="" sources={[source(1)]} complete copied={false} onCopy={jest.fn()} />)
  expect(screen.getByText(/could not find enough information to answer confidently/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'From integrations (1)' }))
  expect(screen.getByText(/DT-1: Issue 1/)).toBeInTheDocument()
})

it('shows source account metadata in the subtitle without empty placeholders', () => {
  render(
    <QueryResults
      answer="Answer"
      sources={[source(1, {
        source: 'telegram',
        sourceMetadata: { channelName: '@dispatch_updates' },
      })]}
      complete
      copied={false}
      onCopy={jest.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'From integrations (1)' }))
  expect(screen.getByText(/@dispatch_updates · Telegram ·/)).toBeInTheDocument()
  expect(screen.queryByText(/undefined|null/)).not.toBeInTheDocument()
})

it('renders markdown formatting instead of raw tokens', () => {
  render(
    <QueryResults
      answer={'## Load 2543\n\n**Status:** In transit\n\n- Driver: John Doe\n- ETA: 3:30 PM'}
      sources={[]}
      complete
      copied={false}
      onCopy={jest.fn()}
    />,
  )

  expect(screen.getByRole('heading', { name: 'Load 2543' })).toBeInTheDocument()
  expect(screen.getByText('Status:').tagName).toBe('STRONG')
  expect(screen.getByText('Driver: John Doe')).toBeInTheDocument()
  expect(screen.queryByText(/\*\*Status:\*\*/)).not.toBeInTheDocument()
})

it('renders markdown tables', () => {
  render(
    <QueryResults
      answer={'| Field | Value |\n| --- | --- |\n| Status | In transit |'}
      sources={[]}
      complete
      copied={false}
      onCopy={jest.fn()}
    />,
  )

  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Field' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: 'In transit' })).toBeInTheDocument()
})

it('does not render unsafe raw HTML', () => {
  const { container } = render(
    <QueryResults
      answer={'<script>alert("x")</script>\n\n[unsafe](javascript:alert(1))'}
      sources={[]}
      complete
      copied={false}
      onCopy={jest.fn()}
    />,
  )

  expect(container.querySelector('script')).toBeNull()
  expect(screen.getByText('<script>alert("x")</script>')).toBeInTheDocument()
  expect(container.textContent).toContain('[unsafe](javascript:alert(1))')
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
})

it('uses content previews instead of generic source titles', () => {
  render(
    <QueryResults
      answer="Answer"
      sources={[source(1, {
        pageTitle: 'fact',
        source: 'telegram',
        content: 'Load 2543 ETA moved to 3:30 PM after the dispatcher update.',
        labels: ['fact'],
      })]}
      complete
      copied={false}
      onCopy={jest.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'From integrations (1)' }))
  expect(screen.getAllByText('Load 2543 ETA moved to 3:30 PM after the dispatcher update.')).toHaveLength(2)
  expect(screen.queryByRole('heading', { name: 'fact' })).not.toBeInTheDocument()
})
