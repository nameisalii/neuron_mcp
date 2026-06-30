import { render, screen } from '@testing-library/react'
import TeamsIntegrationCard from '../TeamsIntegrationCard'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

describe('TeamsIntegrationCard', () => {
  it('renders the not configured state and connect action', () => {
    render(<TeamsIntegrationCard connected={false} />)

    expect(screen.getByText('Microsoft Teams')).toBeInTheDocument()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect' })).toHaveAttribute('href', '/api/integrations/teams/connect')
  })

  it('renders connected controls', () => {
    render(<TeamsIntegrationCard connected teamName="Ali" />)

    expect(screen.getByText('Connected', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/dashboard/integrations/teams')
    expect(screen.getByText('Sync Now')).toBeInTheDocument()
    expect(screen.getByText('Nuclear Reset')).toBeInTheDocument()
  })

  it('renders admin consent required state', () => {
    render(<TeamsIntegrationCard connected adminConsentRequired />)

    expect(screen.getByText('Admin consent required')).toBeInTheDocument()
  })
})
