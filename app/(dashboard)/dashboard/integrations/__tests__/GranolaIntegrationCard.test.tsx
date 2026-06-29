import { render, screen } from '@testing-library/react'
import GranolaIntegrationCard from '../GranolaIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('GranolaIntegrationCard', () => {
  it('shows the connect state when Granola is not connected', () => {
    render(<GranolaIntegrationCard connected={false} />)
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument()
    expect(screen.queryByText('Nuclear Reset')).not.toBeInTheDocument()
  })

  it('shows sync controls when Granola is connected', () => {
    render(
      <GranolaIntegrationCard
        connected
        createdAt="2026-06-01T00:00:00.000Z"
        lastSyncAt="2026-06-12T00:00:00.000Z"
      />,
    )

    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/granola')
    expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument()
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
    // The connected status badge is a <span>; scope to it to avoid matching the
    // "Connected — …" subtitle paragraph.
    expect(screen.getByText('Connected', { selector: 'span' })).toBeInTheDocument()
  })
})
